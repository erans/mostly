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
# shellcheck disable=SC2034  # Used by subcommand implementations in Tasks 9-12.
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=lib/deploy-cloudflare-utils.sh
# shellcheck disable=SC1091  # Path is dynamic ($SCRIPT_DIR); resolved at runtime.
source "$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh"

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

Run `scripts/deploy-cloudflare.sh <subcommand> --help` for subcommand flags.
USAGE
}

main() {
  if [[ $# -eq 0 ]]; then
    usage
    exit 1
  fi

  local subcommand="$1"
  shift

  case "$subcommand" in
    init)    die "init not yet implemented" ;;
    update)  die "update not yet implemented" ;;
    destroy) die "destroy not yet implemented" ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown subcommand: $subcommand" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
