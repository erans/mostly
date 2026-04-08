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
