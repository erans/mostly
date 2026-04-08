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

@test "patch_wrangler_toml_field sets database_id on a blank config" {
  tmp=$(mktemp)
  cat > "$tmp" <<'TOML'
[[d1_databases]]
binding = "DB"
database_name = "mostly-db"
database_id = ""
migrations_dir = "packages/db/migrations"
TOML
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && patch_wrangler_toml_field '$tmp' database_id new-id-123"
  [ "$status" -eq 0 ]
  run grep "database_id" "$tmp"
  [[ "$output" == *'database_id = "new-id-123"'* ]]
  rm -f "$tmp"
}

@test "patch_wrangler_toml_field replaces an existing database_id" {
  tmp=$(mktemp)
  cat > "$tmp" <<'TOML'
[[d1_databases]]
database_id = "old-id"
TOML
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && patch_wrangler_toml_field '$tmp' database_id new-id"
  [ "$status" -eq 0 ]
  run grep "database_id" "$tmp"
  [[ "$output" == *'database_id = "new-id"'* ]]
  [[ "$output" != *'old-id'* ]]
  rm -f "$tmp"
}

@test "patch_wrangler_toml_field sets WORKSPACE_ID on a blank vars block" {
  tmp=$(mktemp)
  cat > "$tmp" <<'TOML'
[vars]
WORKSPACE_ID = ""
TOML
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && patch_wrangler_toml_field '$tmp' WORKSPACE_ID 01WS001"
  [ "$status" -eq 0 ]
  run grep "WORKSPACE_ID" "$tmp"
  [[ "$output" == *'WORKSPACE_ID = "01WS001"'* ]]
  rm -f "$tmp"
}

@test "patch_wrangler_toml_field can clear a field back to empty" {
  tmp=$(mktemp)
  cat > "$tmp" <<'TOML'
[[d1_databases]]
database_id = "filled"
TOML
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && patch_wrangler_toml_field '$tmp' database_id ''"
  [ "$status" -eq 0 ]
  run grep "database_id" "$tmp"
  [[ "$output" == *'database_id = ""'* ]]
  rm -f "$tmp"
}

@test "patch_wrangler_toml_route appends a route block when none exists" {
  tmp=$(mktemp)
  cat > "$tmp" <<'TOML'
name = "mostly"
main = "x"
TOML
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && patch_wrangler_toml_route '$tmp' mostly.example.com"
  [ "$status" -eq 0 ]
  run cat "$tmp"
  [[ "$output" == *'route = { pattern = "mostly.example.com/*", custom_domain = true }'* ]]
  rm -f "$tmp"
}

@test "unpatch_wrangler_toml_route removes the route block" {
  tmp=$(mktemp)
  cat > "$tmp" <<'TOML'
name = "mostly"
route = { pattern = "mostly.example.com/*", custom_domain = true }
main = "x"
TOML
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && unpatch_wrangler_toml_route '$tmp'"
  [ "$status" -eq 0 ]
  run cat "$tmp"
  [[ "$output" != *"route ="* ]]
  rm -f "$tmp"
}

@test "parse_deploy_url extracts an https workers.dev URL" {
  sample=' ⛅️ wrangler 3.85.0
-------------------
Total Upload: 100.00 KiB
Uploaded mostly (1.23 sec)
Published mostly (0.45 sec)
  https://mostly.test.workers.dev
Current Deployment ID: abc'
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && parse_deploy_url '$sample'"
  [ "$status" -eq 0 ]
  [ "$output" = "https://mostly.test.workers.dev" ]
}

@test "parse_deploy_url extracts a custom-domain URL" {
  sample='Published mostly
  https://tasks.acme.com
Deployment ID: xyz'
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && parse_deploy_url '$sample'"
  [ "$status" -eq 0 ]
  [ "$output" = "https://tasks.acme.com" ]
}

@test "parse_deploy_url dies when no URL is present" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && parse_deploy_url 'nothing here'"
  [ "$status" -eq 1 ]
  [[ "$output" == *"could not parse"* ]]
}

@test "retry_once returns 0 on first-attempt success" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && retry_once 0 true"
  [ "$status" -eq 0 ]
}

@test "retry_once retries after a failure and succeeds on second attempt" {
  tmp=$(mktemp)
  echo 0 > "$tmp"
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && retry_once 0 bash -c 'n=\$(cat $tmp); n=\$((n+1)); echo \$n > $tmp; if [ \"\$n\" -lt 2 ]; then exit 1; else exit 0; fi'"
  [ "$status" -eq 0 ]
  rm -f "$tmp"
}

@test "retry_once fails after two failed attempts" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && retry_once 0 false"
  [ "$status" -ne 0 ]
}

@test "run_cmd runs the command when DRY_RUN is unset" {
  tmp="/tmp/run-cmd-real-$$"
  rm -f "$tmp"
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && unset DRY_RUN && run_cmd touch '$tmp'"
  [ "$status" -eq 0 ]
  [ -f "$tmp" ]
  rm -f "$tmp"
}

@test "run_cmd prints would-run line and skips execution when DRY_RUN=1" {
  tmp="/tmp/run-cmd-dry-$$"
  rm -f "$tmp"
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && DRY_RUN=1 run_cmd touch '$tmp' 2>&1"
  [ "$status" -eq 0 ]
  [[ "$output" == *"would-run: touch $tmp"* ]]
  [ ! -f "$tmp" ]
}

@test "run_cmd_capture forwards stdout when DRY_RUN is unset" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && unset DRY_RUN && run_cmd_capture 'fallback' echo hello"
  [ "$status" -eq 0 ]
  [ "$output" = "hello" ]
}

@test "run_cmd_capture emits canned stdout when DRY_RUN=1" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && DRY_RUN=1 run_cmd_capture 'canned-value' echo not-actually-run 2>/dev/null"
  [ "$status" -eq 0 ]
  [ "$output" = "canned-value" ]
}

@test "run_cmd_capture writes would-run line to stderr when DRY_RUN=1" {
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && DRY_RUN=1 run_cmd_capture 'canned' echo skip-me 2>&1 >/dev/null"
  [ "$status" -eq 0 ]
  [[ "$output" == *"would-run: echo skip-me"* ]]
}

@test "patch_wrangler_toml_field preserves leading indentation" {
  tmp=$(mktemp)
  cat > "$tmp" <<'TOML'
[[d1_databases]]
  database_id = "old"
TOML
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && patch_wrangler_toml_field '$tmp' database_id new"
  [ "$status" -eq 0 ]
  run cat "$tmp"
  [[ "$output" == *'  database_id = "new"'* ]]
  rm -f "$tmp"
}

@test "parse_deploy_url skips a Cloudflare dashboard URL and returns the deploy URL" {
  sample='Visit https://dash.cloudflare.com/abc123/workers/services/view/mostly to manage.
Published mostly (0.45 sec)
  https://mostly.test.workers.dev'
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && parse_deploy_url '$sample'"
  [ "$status" -eq 0 ]
  [ "$output" = "https://mostly.test.workers.dev" ]
}

@test "run_cmd honors DRY_RUN=true (not just DRY_RUN=1)" {
  tmp="/tmp/run-cmd-true-$$"
  rm -f "$tmp"
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && DRY_RUN=true run_cmd touch '$tmp' 2>&1"
  [ "$status" -eq 0 ]
  [[ "$output" == *"would-run: touch $tmp"* ]]
  [ ! -f "$tmp" ]
}
