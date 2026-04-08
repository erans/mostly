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

  printf 'init admin-handle=%s domain=%s workspace-slug=%s dry_run=%s\n' \
    "${admin_handle:-<prompt>}" "${domain:-<none>}" "$workspace_slug" "${DRY_RUN:-0}"

  # Real logic lands in Task 9 and Task 10. For now this stub is enough to
  # satisfy the argument-parsing tests.
}

cmd_update() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) export DRY_RUN=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown update flag: $1" ;;
    esac
  done

  printf 'update dry_run=%s\n' "${DRY_RUN:-0}"
  # Real logic lands in Task 11.
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
