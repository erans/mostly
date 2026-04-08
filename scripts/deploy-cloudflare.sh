#!/usr/bin/env bash
#
# Provision and update Mostly on Cloudflare Workers + D1.
#
# Usage:
#   scripts/deploy-cloudflare.sh init [flags]
#   scripts/deploy-cloudflare.sh update [flags]
#   scripts/deploy-cloudflare.sh destroy --yes-i-really-mean-it
#
# Spec: docs/superpowers/specs/2026-04-07-cloudflare-provisioner-design.md

set -euo pipefail
IFS=$'\n\t'

# Resolve the script's own directory so we can source the helper library
# regardless of the caller's cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC2034  # Used by cmd_init / cmd_update / cmd_destroy.
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=lib/deploy-cloudflare-utils.sh
# shellcheck disable=SC1091  # Path is dynamic ($SCRIPT_DIR); resolved at runtime.
source "$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh"

# Locations (these can be overridden by env for tests).
# shellcheck disable=SC2034  # Consumed by cmd_init / cmd_update / cmd_destroy.
STATE_FILE="${STATE_FILE:-$REPO_ROOT/.cloudflare.env}"
# shellcheck disable=SC2034  # Consumed by cmd_init / cmd_update / cmd_destroy.
WRANGLER_TOML="${WRANGLER_TOML:-$REPO_ROOT/wrangler.toml}"
# shellcheck disable=SC2034  # Consumed by cmd_init / cmd_update / cmd_destroy.
WORKSPACE_ID_DEFAULT="01WORKSPACE000000000000001"
# shellcheck disable=SC2034  # Consumed by cmd_init / cmd_update / cmd_destroy.
DATABASE_NAME_DEFAULT="mostly-db"
# shellcheck disable=SC2034  # Consumed by cmd_init / cmd_update / cmd_destroy.
WORKER_NAME_DEFAULT="mostly"

trap 'on_error $LINENO' ERR
on_error() {
  local line="$1"
  printf '[ERROR] %s: failed at step "%s" (line %s)\n' "$0" "${CURRENT_STEP:-(unknown)}" "$line" >&2
}

usage() {
  cat <<'USAGE'
Usage: scripts/deploy-cloudflare.sh <subcommand> [flags]

Subcommands:
  init                 Fresh install: provision D1, deploy worker + frontend,
                       register first admin, install API key + agent token.
  update               Push new code to an existing deployment. Applies new
                       migrations, rebuilds web + worker, redeploys. Does not
                       touch users, tokens, or workspace data.
  destroy              Tear down the deployment. Requires --yes-i-really-mean-it.

init flags:
  --domain <host>          Install with a custom domain (adds a route block).
  --admin-handle <handle>  Admin user handle (prompted if omitted).
  --admin-password <pw>    Admin password (prompted if omitted).
  --workspace-slug <slug>  Workspace slug (default: default).
  --dry-run                Print intended actions without running them.

update flags:
  --dry-run                Print intended actions without running them.

destroy flags:
  --yes-i-really-mean-it   Required. Without it, destroy prints what would be
                           deleted and exits non-zero.
  --dry-run                Print intended actions without running them.
USAGE
}

# Guard a flag that consumes a value: dies cleanly when the value is missing.
# Usage: need_value <flag> <arg-count>
#   need_value "$1" "$#"
need_value() {
  local flag="$1"
  local remaining="$2"
  if [[ "$remaining" -lt 2 ]]; then
    die "flag $flag requires a value"
  fi
}

cmd_init() {
  local domain=""
  local admin_handle=""
  local admin_password=""
  local workspace_slug="default"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain)         need_value "$1" "$#"; domain="$2"; shift 2 ;;
      --admin-handle)   need_value "$1" "$#"; admin_handle="$2"; shift 2 ;;
      --admin-password) need_value "$1" "$#"; admin_password="$2"; shift 2 ;;
      --workspace-slug) need_value "$1" "$#"; workspace_slug="$2"; shift 2 ;;
      --dry-run)        export DRY_RUN=1; shift ;;
      -h|--help)        usage; exit 0 ;;
      *) die "unknown init flag: $1" ;;
    esac
  done

  # Captured here so the parser tests can pass; consumed by Task 9 when it
  # threads the admin password into the bootstrap call. The no-op reference
  # below tells shellcheck the variable is intentionally captured for later.
  : "$admin_password"

  validate_slug "$workspace_slug"
  if [[ -n "$admin_handle" ]]; then
    validate_slug "$admin_handle"
  fi

  # Preflight
  log_step "preflight: required commands"
  require_cmd wrangler
  require_cmd pnpm
  require_cmd curl
  require_cmd openssl
  require_cmd jq

  log_step "preflight: repo root"
  require_file "$WRANGLER_TOML"
  require_file "$REPO_ROOT/packages/server/package.json"
  require_file "$REPO_ROOT/packages/web/package.json"

  log_step "preflight: wrangler authentication"
  run_cmd wrangler whoami >/dev/null

  log_step "preflight: state file must not exist"
  if [[ -f "$STATE_FILE" ]]; then
    die "already initialized (found $STATE_FILE) — use update or destroy instead"
  fi

  # Prompt for missing credentials
  if [[ -z "$admin_handle" ]]; then
    if [[ ! -t 0 ]]; then
      die "admin handle required (stdin is not a TTY; pass --admin-handle)"
    fi
    read -rp "admin handle: " admin_handle
    validate_slug "$admin_handle"
  fi
  if [[ -z "$admin_password" ]]; then
    if [[ ! -t 0 ]]; then
      die "admin password required (stdin is not a TTY; pass --admin-password)"
    fi
    local confirm=""
    read -rsp "admin password: " admin_password
    echo
    read -rsp "confirm password: " confirm
    echo
    if [[ "$admin_password" != "$confirm" ]]; then
      die "passwords do not match"
    fi
  fi

  log_step "create D1 database"
  local create_json database_id
  # In dry-run mode, run_cmd_capture emits this canned JSON so the rest of
  # the script has a database_id to thread through. In real (or stub) mode
  # the canned value is ignored and wrangler's actual stdout is captured.
  create_json=$(run_cmd_capture \
    '{"uuid":"00000000-0000-0000-0000-000000000001","name":"mostly-db"}' \
    wrangler d1 create "$DATABASE_NAME_DEFAULT" --json)
  database_id=$(printf '%s' "$create_json" | jq -r 'if type == "object" then .uuid else error("expected single JSON object") end')
  if [[ -z "$database_id" || "$database_id" == "null" || "$database_id" == *$'\n'* ]]; then
    die "could not parse database_id from wrangler output: $create_json"
  fi

  log_step "patch wrangler.toml: database_id"
  run_cmd patch_wrangler_toml_field "$WRANGLER_TOML" database_id "$database_id"

  log_step "apply D1 migrations"
  run_cmd wrangler d1 migrations apply "$DATABASE_NAME_DEFAULT" --remote

  log_step "seed workspace row"
  local workspace_id="$WORKSPACE_ID_DEFAULT"
  # SAFETY: every value interpolated into the SQL string below MUST be either
  # validated by validate_slug (which enforces ^[a-z][a-z0-9-]{0,62}$ and
  # therefore cannot break out of a single-quoted string) or a hard-coded
  # constant defined at the top of this script. validate_slug has already
  # run on $workspace_slug; $workspace_id is WORKSPACE_ID_DEFAULT. Anything
  # added here in future tasks must hold that invariant or be parameterized
  # via a prepared statement instead.
  run_cmd wrangler d1 execute "$DATABASE_NAME_DEFAULT" --remote --command \
    "INSERT OR IGNORE INTO workspace (id, slug, name, created_at, updated_at) VALUES ('$workspace_id', '$workspace_slug', 'Default Workspace', datetime('now'), datetime('now'));"

  log_step "patch wrangler.toml: WORKSPACE_ID"
  run_cmd patch_wrangler_toml_field "$WRANGLER_TOML" WORKSPACE_ID "$workspace_id"

  if [[ -n "$domain" ]]; then
    log_step "patch wrangler.toml: route for $domain"
    run_cmd patch_wrangler_toml_route "$WRANGLER_TOML" "$domain"
  fi

  log_step "build web package (VITE_SINGLE_ORIGIN=true)"
  ( cd "$REPO_ROOT" && VITE_SINGLE_ORIGIN=true run_cmd pnpm --filter @mostly/web build )

  log_step "build worker bundle"
  ( cd "$REPO_ROOT" && run_cmd pnpm --filter @mostly/server build:worker )

  log_step "deploy worker"
  local deploy_output worker_url
  # In dry-run we substitute a canned wrangler deploy stdout so parse_deploy_url
  # can still extract a URL the rest of the bootstrap depends on.
  deploy_output=$(
    cd "$REPO_ROOT" && run_cmd_capture \
      $' ⛅️ wrangler 0.0.0\n  https://mostly.dry-run.workers.dev\nDeployment ID: dry-run\n' \
      wrangler deploy 2>&1
  )
  printf '%s\n' "$deploy_output"
  worker_url=$(parse_deploy_url "$deploy_output")

  log_step "register first admin"
  local cookie_jar register_body_file
  cookie_jar=$(mktemp)
  # Body file sits next to the cookie jar, so a single trap cleans both up.
  # mktemp creates with mode 600, so the password is never world-readable.
  register_body_file=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$cookie_jar' '$register_body_file'" EXIT

  # Build the JSON body with jq so passwords containing quotes, backslashes,
  # or control characters are escaped correctly, and write it to a mode-600
  # file so the plaintext password never lands in argv (and therefore never
  # in the dry-run trace, `ps` output, or CI logs).
  jq -nc --arg handle "$admin_handle" \
         --arg password "$admin_password" \
         --arg display "$admin_handle" \
         '{handle: $handle, password: $password, display_name: $display}' \
    > "$register_body_file"
  retry_once 2 run_cmd_capture '{"principal":{"id":"01DRY","handle":"admin"}}' \
    curl -sS -c "$cookie_jar" -X POST "$worker_url/v0/auth/register" \
    -H 'Content-Type: application/json' \
    -d "@$register_body_file" >/dev/null

  log_step "mint admin API key"
  local key_response api_key
  key_response=$(retry_once 2 run_cmd_capture \
    '{"id":"01DRY_KEY","name":"admin-cli","key":"msk_dry000000000000000000000000000000000000000000000000000000000000"}' \
    curl -sS -b "$cookie_jar" -X POST "$worker_url/v0/auth/api-keys" \
    -H 'Content-Type: application/json' \
    -d '{"name":"admin-cli"}')
  api_key=$(printf '%s' "$key_response" | jq -r '.key')
  if [[ -z "$api_key" || "$api_key" == "null" ]]; then
    die "could not parse api_key from response: $key_response"
  fi

  log_step "install workspace agent token"
  local agent_token_hex agent_token agent_hash
  agent_token_hex=$(run_cmd_capture \
    'deadbeefcafed00dfeedfacebeeff00ddeadbeefcafed00dfeedfacebeeff00d' \
    openssl rand -hex 32)
  agent_token="mat_$agent_token_hex"
  agent_hash=$(printf %s "$agent_token" | run_cmd_capture \
    '(stdin)= 0000000000000000000000000000000000000000000000000000000000000000' \
    openssl dgst -sha256 -hex | awk '{print $2}')
  if [[ ! "$agent_hash" =~ ^[0-9a-f]{64}$ ]]; then
    die "openssl dgst returned a malformed sha256 hash: $agent_hash"
  fi
  # SAFETY: same invariant as the workspace INSERT above. $agent_hash is
  # validated to be a 64-char lowercase hex string by the regex check
  # immediately above; $workspace_id is WORKSPACE_ID_DEFAULT. Any value
  # added to this UPDATE in future tasks must hold that invariant or be
  # parameterized via a prepared statement.
  run_cmd wrangler d1 execute "$DATABASE_NAME_DEFAULT" --remote --command \
    "UPDATE workspace SET agent_token_hash = '$agent_hash', updated_at = datetime('now') WHERE id = '$workspace_id';"

  log_step "persist state file"
  if is_dry_run; then
    printf 'would-write: %s\n' "$STATE_FILE" >&2
  else
    write_state "$STATE_FILE" \
      "DATABASE_ID=$database_id" \
      "DATABASE_NAME=$DATABASE_NAME_DEFAULT" \
      "WORKSPACE_ID=$workspace_id" \
      "WORKSPACE_SLUG=$workspace_slug" \
      "WORKER_NAME=$WORKER_NAME_DEFAULT" \
      "WORKER_URL=$worker_url" \
      "ADMIN_HANDLE=$admin_handle" \
      "DOMAIN=$domain"
  fi

  log_step "done"
  cat <<EOF

Mostly deployed successfully.

URL:          $worker_url
Admin:        $admin_handle
API key:      $api_key                   (save this — shown only once)
Agent token:  $agent_token                   (save this — shown only once)

Configure your CLI:
  mostly config set server_url $worker_url
  mostly config set api_key $api_key

State saved to $STATE_FILE (gitignored).
EOF
}

cmd_update() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) export DRY_RUN=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown update flag: $1" ;;
    esac
  done

  log_step "preflight: required commands"
  require_cmd wrangler
  require_cmd pnpm

  log_step "preflight: state file"
  # read_state would die with a generic "required file not found" message;
  # detect the missing-file case ourselves so the error contains the
  # actionable "not initialized" hint that points users at `init`.
  if [[ ! -f "$STATE_FILE" ]]; then
    die "not initialized (state file $STATE_FILE not found) — run \`init\` first"
  fi
  read_state "$STATE_FILE"
  if [[ -z "${DATABASE_ID:-}" || -z "${WORKSPACE_ID:-}" || -z "${WORKER_NAME:-}" || -z "${DATABASE_NAME:-}" ]]; then
    die "state file $STATE_FILE is missing required fields (DATABASE_ID, DATABASE_NAME, WORKSPACE_ID, WORKER_NAME)"
  fi

  log_step "preflight: wrangler authentication"
  run_cmd wrangler whoami >/dev/null

  log_step "reconcile wrangler.toml from state"
  require_file "$WRANGLER_TOML"
  run_cmd patch_wrangler_toml_field "$WRANGLER_TOML" database_id "$DATABASE_ID"
  run_cmd patch_wrangler_toml_field "$WRANGLER_TOML" WORKSPACE_ID "$WORKSPACE_ID"
  if [[ -n "${DOMAIN:-}" ]]; then
    run_cmd patch_wrangler_toml_route "$WRANGLER_TOML" "$DOMAIN"
  else
    run_cmd unpatch_wrangler_toml_route "$WRANGLER_TOML"
  fi

  log_step "apply D1 migrations"
  run_cmd wrangler d1 migrations apply "$DATABASE_NAME" --remote

  log_step "build web package (VITE_SINGLE_ORIGIN=true)"
  ( cd "$REPO_ROOT" && VITE_SINGLE_ORIGIN=true run_cmd pnpm --filter @mostly/web build )

  log_step "build worker bundle"
  ( cd "$REPO_ROOT" && run_cmd pnpm --filter @mostly/server build:worker )

  log_step "deploy worker"
  local deploy_output new_url
  # In dry-run we substitute a canned wrangler deploy stdout so parse_deploy_url
  # has a URL to extract for the drift check below.
  deploy_output=$(
    cd "$REPO_ROOT" && run_cmd_capture \
      $' ⛅️ wrangler 0.0.0\n  https://mostly.dry-run.workers.dev\nDeployment ID: dry-run\n' \
      wrangler deploy 2>&1
  )
  printf '%s\n' "$deploy_output"
  new_url=$(parse_deploy_url "$deploy_output")

  if [[ "$new_url" != "${WORKER_URL:-}" ]]; then
    log_warn "deployed URL changed from ${WORKER_URL:-(unset)} to $new_url, updating state"
    if is_dry_run; then
      printf 'would-write: %s\n' "$STATE_FILE" >&2
    else
      # Rewrite WORKER_URL in the state file by re-writing it from scratch.
      write_state "$STATE_FILE" \
        "DATABASE_ID=$DATABASE_ID" \
        "DATABASE_NAME=$DATABASE_NAME" \
        "WORKSPACE_ID=$WORKSPACE_ID" \
        "WORKSPACE_SLUG=${WORKSPACE_SLUG:-default}" \
        "WORKER_NAME=$WORKER_NAME" \
        "WORKER_URL=$new_url" \
        "ADMIN_HANDLE=${ADMIN_HANDLE:-}" \
        "DOMAIN=${DOMAIN:-}"
    fi
  fi

  log_step "done"
  cat <<EOF

Mostly updated.
  URL:         $new_url
  Migrations:  applied
  Worker:      deployed
EOF
}

cmd_destroy() {
  local yes_really=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes-i-really-mean-it) yes_really=1; shift ;;
      --dry-run) export DRY_RUN=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown destroy flag: $1" ;;
    esac
  done

  if [[ $yes_really -ne 1 ]]; then
    die "destroy is destructive — re-run with --yes-i-really-mean-it"
  fi

  printf 'destroy yes_really=%s dry_run=%s\n' "$yes_really" "${DRY_RUN:-0}"
  # Real logic lands in Task 12.
}

main() {
  if [[ $# -eq 0 ]]; then
    usage >&2
    exit 1
  fi

  local subcommand="$1"
  shift

  case "$subcommand" in
    init)      cmd_init "$@" ;;
    update)    cmd_update "$@" ;;
    destroy)   cmd_destroy "$@" ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown subcommand: $subcommand" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
