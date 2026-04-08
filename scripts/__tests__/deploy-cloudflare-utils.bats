#!/usr/bin/env bats

load bats-helpers

setup() {
  source "$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh"
}

@test "deploy-cloudflare-utils.sh sources cleanly" {
  :
}

# Helper unit tests land here in subsequent tasks.

@test "log_step prints to stderr and sets CURRENT_STEP" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && log_step 'hello world' 2>&1 >/dev/null && echo \"step=\$CURRENT_STEP\""
  [ "$status" -eq 0 ]
  [[ "$output" == *"hello world"* ]]
  [[ "$output" == *"step=hello world"* ]]
}

@test "log_warn prints to stderr with a WARN prefix" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && log_warn 'be careful' 2>&1 >/dev/null"
  [ "$status" -eq 0 ]
  [[ "$output" == *"WARN"* ]]
  [[ "$output" == *"be careful"* ]]
}

@test "die prints message to stderr and exits 1" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && die 'bad things'"
  [ "$status" -eq 1 ]
  [[ "$output" == *"bad things"* ]]
}

@test "require_cmd succeeds when the command exists" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && require_cmd bash"
  [ "$status" -eq 0 ]
}

@test "require_cmd fails with a helpful message when the command is missing" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && require_cmd totally-made-up-command-xyz"
  [ "$status" -eq 1 ]
  [[ "$output" == *"totally-made-up-command-xyz"* ]]
  [[ "$output" == *"not found"* ]]
}

@test "require_file succeeds when the file exists" {
  tmp=$(mktemp)
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && require_file '$tmp'"
  [ "$status" -eq 0 ]
  rm -f "$tmp"
}

@test "require_file fails when the file is missing" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && require_file /tmp/definitely-not-there-xyz"
  [ "$status" -eq 1 ]
  [[ "$output" == *"/tmp/definitely-not-there-xyz"* ]]
}
