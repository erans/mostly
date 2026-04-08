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

@test "log_step writes nothing to stdout" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && log_step 'hello' 2>/dev/null"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "log_warn writes nothing to stdout" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && log_warn 'careful' 2>/dev/null"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "die writes nothing to stdout" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && die 'oops' 2>/dev/null"
  [ "$status" -eq 1 ]
  [ -z "$output" ]
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

@test "die concatenates multi-arg messages with spaces" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && die 'invalid slug:' 'bad-value'"
  [ "$status" -eq 1 ]
  [[ "$output" == *"invalid slug: bad-value"* ]]
}

@test "log_warn concatenates multi-arg messages with spaces" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && log_warn 'two' 'words' 2>&1 >/dev/null"
  [ "$status" -eq 0 ]
  [[ "$output" == *"two words"* ]]
}

@test "require_file fails with a clear message when the path is a directory" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && require_file /tmp"
  [ "$status" -eq 1 ]
  [[ "$output" == *"not a regular file"* ]]
}

@test "require_file fails with empty-path message when called with no path" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && require_file ''"
  [ "$status" -eq 1 ]
  [[ "$output" == *"empty path"* ]]
}

@test "write_state writes KEY=value lines in the order given" {
  tmp=$(mktemp)
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && write_state '$tmp' DATABASE_ID=abc WORKSPACE_ID=def WORKER_URL=https://x.workers.dev"
  [ "$status" -eq 0 ]
  run cat "$tmp"
  [ "$output" = "DATABASE_ID='abc'
WORKSPACE_ID='def'
WORKER_URL='https://x.workers.dev'" ]
  rm -f "$tmp"
}

@test "write_state refuses to write when a value contains a single quote" {
  tmp=$(mktemp)
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && write_state '$tmp' BAD=\"it's broken\""
  [ "$status" -eq 1 ]
  [[ "$output" == *"single quote"* ]]
  rm -f "$tmp"
}

@test "read_state sources the state file into the current shell" {
  tmp=$(mktemp)
  printf 'DATABASE_ID=xyz\nWORKSPACE_ID=wsp\n' > "$tmp"
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && read_state '$tmp' && echo \"db=\$DATABASE_ID ws=\$WORKSPACE_ID\""
  [ "$status" -eq 0 ]
  [[ "$output" == *"db=xyz ws=wsp"* ]]
  rm -f "$tmp"
}

@test "read_state dies when the state file is missing" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && read_state /tmp/definitely-not-a-state-file-xyz"
  [ "$status" -eq 1 ]
  [[ "$output" == *"definitely-not-a-state-file-xyz"* ]]
}

@test "validate_slug accepts a simple lowercase slug" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && validate_slug default"
  [ "$status" -eq 0 ]
}

@test "validate_slug accepts a slug with hyphens and digits" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && validate_slug acme-corp-42"
  [ "$status" -eq 0 ]
}

@test "validate_slug rejects uppercase" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && validate_slug Acme"
  [ "$status" -eq 1 ]
  [[ "$output" == *"invalid"* ]]
}

@test "validate_slug rejects a leading digit" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && validate_slug 1abc"
  [ "$status" -eq 1 ]
}

@test "validate_slug rejects a single quote in the value" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && validate_slug \"it's\""
  [ "$status" -eq 1 ]
}

@test "validate_slug rejects empty string" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && validate_slug ''"
  [ "$status" -eq 1 ]
}

@test "write_state rejects empty path" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && write_state '' K=v"
  [ "$status" -eq 1 ]
  [[ "$output" == *"empty path"* ]]
}

@test "write_state rejects bareword pair without equals" {
  tmp=$(mktemp); rm -f "$tmp"
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && write_state '$tmp' BAREWORD"
  [ "$status" -eq 1 ]
  [[ "$output" == *"invalid pair"* ]]
}

@test "write_state rejects key with invalid characters" {
  tmp=$(mktemp); rm -f "$tmp"
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && write_state '$tmp' '1BAD=v'"
  [ "$status" -eq 1 ]
  [[ "$output" == *"invalid key"* ]]
}

@test "write_state rejects value containing newline" {
  tmp=$(mktemp); rm -f "$tmp"
  pair=$'K=line1\nline2'
  run env PAIR="$pair" bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && write_state '$tmp' \"\$PAIR\""
  [ "$status" -eq 1 ]
  [[ "$output" == *"newline"* ]]
  rm -f "$tmp"
}

@test "write_state quotes values to neutralize command substitution" {
  tmp=$(mktemp); rm -f "$tmp"
  rm -f /tmp/pwned-by-write-state-test
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && write_state '$tmp' 'EVIL=\$(touch /tmp/pwned-by-write-state-test)'"
  [ "$status" -eq 0 ]
  run bash -c "source '$tmp' && echo \"value=\$EVIL\""
  [[ "$output" == *'value=$(touch /tmp/pwned-by-write-state-test)'* ]]
  [ ! -f /tmp/pwned-by-write-state-test ]
  rm -f "$tmp"
}

@test "write_state creates the file with 600 permissions" {
  tmp=$(mktemp); rm -f "$tmp"
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && write_state '$tmp' K=v"
  [ "$status" -eq 0 ]
  perms=$(stat -c '%a' "$tmp" 2>/dev/null || stat -f '%A' "$tmp")
  [ "$perms" = "600" ]
  rm -f "$tmp"
}
