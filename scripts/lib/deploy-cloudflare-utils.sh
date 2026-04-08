#!/usr/bin/env bash
#
# Shared helpers for scripts/deploy-cloudflare.sh. Sourced, not executed.
#
# Functions defined in this file:
#   require_cmd <name>             — exit if a command is missing from PATH
#   require_file <path>            — exit if a file is missing
#   log_step <message>             — print a progress line, set CURRENT_STEP
#   log_warn <message>             — print a warning to stderr
#   die <message>                  — print an error and exit 1
#   read_state <path>              — source a state file, die if missing
#   write_state <path> <k>=<v>...  — write a key/value state file
#   validate_slug <value>          — enforce [a-z][a-z0-9-]{0,62}
#   patch_wrangler_toml_field <path> <key> <value>
#   patch_wrangler_toml_route <path> <domain>
#   unpatch_wrangler_toml_route <path>
#   parse_deploy_url <stdout>      — extract the deployed URL from wrangler output
#   retry_once <delay_seconds> <cmd...>
#   run_cmd <cmd...>               — run, or print "would-run:" if DRY_RUN=1
#   run_cmd_capture <canned> <cmd...> — capture stdout, or emit canned in dry-run
#
# All functions write errors to stderr, not stdout.

set -euo pipefail
IFS=$'\n\t'

# Populated by log_step, consumed by the trap in the entry-point script.
# shellcheck disable=SC2034  # Used by the trap in deploy-cloudflare.sh (Task 5).
CURRENT_STEP="(not started)"

# Call from the top-level shell, not a subshell — CURRENT_STEP is read by the
# ERR trap in the entry script and won't propagate out of $(...) or pipelines.
log_step() {
  local IFS=' '
  local message="$*"
  # shellcheck disable=SC2034  # Read by the trap in deploy-cloudflare.sh (Task 7+).
  CURRENT_STEP="$message"
  printf '==> %s\n' "$message" >&2
}

log_warn() {
  local IFS=' '
  local message="$*"
  printf '[WARN] %s\n' "$message" >&2
}

die() {
  local IFS=' '
  local message="$*"
  printf '[ERROR] %s\n' "$message" >&2
  exit 1
}

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    die "required command not found: $name (install it or add it to PATH)"
  fi
}

require_file() {
  local path="$1"
  if [[ -z "$path" ]]; then
    die "require_file: empty path"
  fi
  if [[ ! -e "$path" ]]; then
    die "required file not found: $path"
  fi
  if [[ ! -f "$path" ]]; then
    die "required path is not a regular file: $path"
  fi
}

# Write a KEY=value state file. Each argument after the first is a
# KEY=VALUE pair. Values are written single-quoted so the file is safe to
# source even if values contain shell metacharacters; we reject single
# quotes, newlines, and carriage returns in values to keep the quoting
# scheme bulletproof. The file is chmod 600 after creation as a defensive
# measure.
write_state() {
  local path="$1"
  if [[ -z "$path" ]]; then
    die "write_state: empty path"
  fi
  shift
  local pair key value
  for pair in "$@"; do
    if [[ "$pair" != *=* ]]; then
      die "write_state: invalid pair (expected KEY=value): $pair"
    fi
    key="${pair%%=*}"
    value="${pair#*=}"
    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      die "write_state: invalid key (must match ^[A-Za-z_][A-Za-z0-9_]*\$): $key"
    fi
    if [[ "$value" == *"'"* ]]; then
      die "write_state: refusing to write value containing a single quote: $pair"
    fi
    if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
      die "write_state: refusing to write value containing a newline: $pair"
    fi
  done
  : > "$path"
  chmod 600 "$path"
  for pair in "$@"; do
    key="${pair%%=*}"
    value="${pair#*=}"
    printf "%s='%s'\n" "$key" "$value" >> "$path"
  done
}

# Source a state file into the current shell. Dies if the file doesn't
# exist. Used by update and destroy to read init's state.
read_state() {
  local path="$1"
  require_file "$path"
  # shellcheck disable=SC1090
  source "$path"
}

# Enforce a DNS-ish slug: lowercase letter first, then letters/digits/hyphens,
# max 63 chars. Rejects anything else. Used for --workspace-slug and
# --admin-handle to keep them safe for SQL interpolation and JSON payloads.
validate_slug() {
  local value="$1"
  if [[ -z "$value" ]]; then
    die "invalid slug: (empty)"
  fi
  if [[ ! "$value" =~ ^[a-z][a-z0-9-]{0,62}$ ]]; then
    die "invalid slug: $value (must match ^[a-z][a-z0-9-]{0,62}\$)"
  fi
}

# Patch a single `key = "value"` line in a TOML file in place. Works for
# both `database_id` and `WORKSPACE_ID` because both have the same
# `<key> = "<value>"` shape. The patch is idempotent and preserves all
# other lines exactly.
#
# Implementation: uses a temporary file + awk for portability (sed -i
# differs between GNU and BSD). An empty value is explicitly supported
# so destroy can reset fields to "".
patch_wrangler_toml_field() {
  local path="$1"
  local key="$2"
  local value="$3"
  require_file "$path"
  local tmp
  tmp=$(mktemp)
  awk -v key="$key" -v value="$value" '
    {
      if ($0 ~ "^[[:space:]]*"key"[[:space:]]*=") {
        printf("%s = \"%s\"\n", key, value)
      } else {
        print
      }
    }
  ' "$path" > "$tmp"
  mv "$tmp" "$path"
}

# Append a `route = { pattern = "<domain>/*", custom_domain = true }` line
# to wrangler.toml at the end of file. If a route line already exists, it
# is replaced (so the call is idempotent).
patch_wrangler_toml_route() {
  local path="$1"
  local domain="$2"
  require_file "$path"
  # Strip any existing route line first.
  unpatch_wrangler_toml_route "$path"
  printf '\nroute = { pattern = "%s/*", custom_domain = true }\n' "$domain" >> "$path"
}

# Remove any `route = { ... }` line from wrangler.toml. Safe no-op if
# no such line exists.
unpatch_wrangler_toml_route() {
  local path="$1"
  require_file "$path"
  local tmp
  tmp=$(mktemp)
  grep -v '^route = ' "$path" > "$tmp" || true
  mv "$tmp" "$path"
}

# Parse the deployed URL from `wrangler deploy` stdout. Wrangler prints
# the URL on its own line, indented with two spaces, after lines about
# Upload and Published.
parse_deploy_url() {
  local output="$1"
  local url
  url=$(printf '%s\n' "$output" | grep -oE 'https://[a-zA-Z0-9.-]+(\.workers\.dev|[a-zA-Z]{2,})(/[[:alnum:]_./-]*)?' | head -n1) || true
  if [[ -z "$url" ]]; then
    die "could not parse deployed URL from wrangler output"
  fi
  printf '%s\n' "$url"
}

# Run a command. If it fails, wait <delay_seconds> and try again once more.
# If the second attempt also fails, return its non-zero exit code.
retry_once() {
  local delay="$1"
  shift
  if "$@"; then
    return 0
  fi
  log_warn "command failed, retrying in ${delay}s: $*"
  sleep "$delay"
  "$@"
}

# Run a command, or print "would-run: <cmd>" to stderr and skip execution
# if DRY_RUN=1 is set in the environment. Use this for fire-and-forget
# external commands whose stdout is not captured. The would-run line goes
# to stderr so that callers can still redirect command stdout (e.g.
# `run_cmd wrangler whoami >/dev/null`) without losing the dry-run trace.
run_cmd() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    local IFS=' '
    printf 'would-run: %s\n' "$*" >&2
    return 0
  fi
  "$@"
}

# Run a command and emit its stdout, or print "would-run: <cmd>" to
# stderr and emit canned stdout if DRY_RUN=1 is set. Use this for
# external commands whose stdout downstream code parses (e.g.
# `wrangler d1 create --json`, `wrangler deploy`, the curl calls that
# return JSON the script needs to thread through). The first argument
# is the canned stdout; the rest is the command.
run_cmd_capture() {
  local canned="$1"
  shift
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    local IFS=' '
    printf 'would-run: %s\n' "$*" >&2
    printf '%s' "$canned"
    return 0
  fi
  "$@"
}
