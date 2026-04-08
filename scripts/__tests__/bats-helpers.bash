# Shared helpers for deploy-cloudflare bats tests.
#
# Each test should call `setup_stubs` in its setup() and `teardown_stubs` in
# its teardown(). This puts scripts/stubs/ on PATH so invocations of
# wrangler/curl/pnpm/openssl inside the script hit the stubs instead of the
# real binaries, and writes invocation logs to a per-test temp directory.

: "${SCRIPT_DIR:=$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)}"
: "${REPO_ROOT:=$(cd "$SCRIPT_DIR/.." && pwd)}"
export SCRIPT_DIR REPO_ROOT

setup_stubs() {
  STUBS_DIR="$SCRIPT_DIR/stubs"
  STUBS_LOG_DIR="$(mktemp -d)" || { echo "mktemp failed" >&2; return 1; }
  export STUBS_DIR STUBS_LOG_DIR
  export STUB_LOG_FILE="$STUBS_LOG_DIR/invocations.log"
  : > "$STUB_LOG_FILE"
  _ORIG_PATH="$PATH"
  export PATH="$STUBS_DIR:$PATH"
}

teardown_stubs() {
  if [[ -n "${STUBS_LOG_DIR:-}" && -d "$STUBS_LOG_DIR" ]]; then
    rm -rf "$STUBS_LOG_DIR"
  fi
  if [[ -n "${_ORIG_PATH:-}" ]]; then
    PATH="$_ORIG_PATH"
    unset _ORIG_PATH
  fi
  unset STUBS_DIR STUBS_LOG_DIR STUB_LOG_FILE
}

# Return the nth recorded stub invocation line (1-indexed).
stub_invocation() {
  local n="$1"
  sed -n "${n}p" "$STUB_LOG_FILE"
}

# Total number of recorded stub invocations.
stub_invocation_count() {
  grep -c '' "$STUB_LOG_FILE"
}
