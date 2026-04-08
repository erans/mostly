#!/usr/bin/env bats

load bats-helpers

setup() {
  setup_stubs
}

teardown() {
  teardown_stubs
}

@test "deploy-cloudflare.sh with no arguments prints usage and exits 1" {
  run "$SCRIPT_DIR/deploy-cloudflare.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage:"* ]]
}

@test "deploy-cloudflare.sh with --help exits 0 and prints usage" {
  run "$SCRIPT_DIR/deploy-cloudflare.sh" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage:"* ]]
}

@test "deploy-cloudflare.sh with an unknown subcommand exits 1" {
  run "$SCRIPT_DIR/deploy-cloudflare.sh" nope
  [ "$status" -eq 1 ]
  [[ "$output" == *"Unknown subcommand: nope"* ]]
}

@test "init --dry-run with --domain prints would-run lines and parses domain into a route patch" {
  tmp_state="/tmp/mostly-bats-state-$$"
  tmp_toml="/tmp/mostly-bats-toml-$$"
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  rm -f "$tmp_state"
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" init \
    --dry-run --admin-handle admin --admin-password pw --domain mostly.example.com
  [ "$status" -eq 0 ]
  [[ "$output" == *"init"* ]]
  [[ "$output" == *"dry_run=1"* ]]
  [[ "$output" == *"would-run: patch_wrangler_toml_route"* ]]
  [[ "$output" == *"mostly.example.com"* ]]
  rm -f "$tmp_state" "$tmp_toml"
}

@test "init rejects an invalid workspace slug" {
  run "$SCRIPT_DIR/deploy-cloudflare.sh" init --dry-run --admin-handle admin --admin-password pw --workspace-slug 'Bad Slug'
  [ "$status" -eq 1 ]
  [[ "$output" == *"invalid slug"* ]]
}

@test "init rejects an invalid admin handle" {
  run "$SCRIPT_DIR/deploy-cloudflare.sh" init --dry-run --admin-handle '1bad' --admin-password pw
  [ "$status" -eq 1 ]
  [[ "$output" == *"invalid slug"* ]]
}

@test "update --dry-run prints parsed config" {
  run "$SCRIPT_DIR/deploy-cloudflare.sh" update --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"update"* ]]
  [[ "$output" == *"dry_run=1"* ]]
}

@test "destroy without --yes-i-really-mean-it exits 1" {
  run "$SCRIPT_DIR/deploy-cloudflare.sh" destroy
  [ "$status" -eq 1 ]
  [[ "$output" == *"--yes-i-really-mean-it"* ]]
}

@test "init with --domain but no value exits 1 with a clear error" {
  run "$SCRIPT_DIR/deploy-cloudflare.sh" init --domain
  [ "$status" -eq 1 ]
  [[ "$output" == *"--domain"* ]]
  [[ "$output" == *"requires a value"* ]]
  [[ "$output" != *"unbound variable"* ]]
}

@test "init rejects an unknown flag" {
  run "$SCRIPT_DIR/deploy-cloudflare.sh" init --not-a-flag
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown init flag"* ]]
}

@test "destroy --yes-i-really-mean-it exits 0 and prints yes_really=1" {
  run "$SCRIPT_DIR/deploy-cloudflare.sh" destroy --yes-i-really-mean-it
  [ "$status" -eq 0 ]
  [[ "$output" == *"destroy yes_really=1"* ]]
}

@test "init refuses to run if .cloudflare.env already exists" {
  tmp_state=$(mktemp)
  printf 'DATABASE_ID=xyz\n' > "$tmp_state"
  STATE_FILE="$tmp_state" run "$SCRIPT_DIR/deploy-cloudflare.sh" init --admin-handle admin --admin-password pw
  [ "$status" -eq 1 ]
  [[ "$output" == *"already initialized"* ]]
  rm -f "$tmp_state"
}

@test "init records wrangler d1 create, migrations apply, and workspace seed via stubs" {
  tmp_state="/tmp/mostly-bats-state-$$"
  tmp_toml="/tmp/mostly-bats-toml-$$"
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  rm -f "$tmp_state"
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" init \
    --admin-handle admin --admin-password pw
  [ "$status" -eq 0 ]
  run cat "$STUB_LOG_FILE"
  # These are the key preflight + provision calls for this task. The bootstrap
  # curl calls are added in Task 10 and checked there.
  [[ "$output" == *"wrangler whoami"* ]]
  [[ "$output" == *"wrangler d1 create"* ]]
  [[ "$output" == *"wrangler d1 migrations apply"* ]]
  [[ "$output" == *"INSERT OR IGNORE INTO workspace"* ]]
  rm -f "$tmp_state" "$tmp_toml"
}

@test "init patches wrangler.toml database_id and WORKSPACE_ID after provisioning" {
  tmp_state="/tmp/mostly-bats-state-$$"
  tmp_toml="/tmp/mostly-bats-toml-$$"
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
binding = "DB"
database_name = "mostly-db"
database_id = ""
migrations_dir = "packages/db/migrations"

[vars]
WORKSPACE_ID = ""
TOML
  rm -f "$tmp_state"
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" init \
    --admin-handle admin --admin-password pw
  [ "$status" -eq 0 ]
  run grep 'database_id' "$tmp_toml"
  [[ "$output" == *'database_id = "00000000-0000-0000-0000-000000000001"'* ]]
  run grep 'WORKSPACE_ID' "$tmp_toml"
  [[ "$output" == *'WORKSPACE_ID = "01WORKSPACE000000000000001"'* ]]
  rm -f "$tmp_state" "$tmp_toml"
}

@test "init --dry-run prints would-run lines for every wrangler call and leaves wrangler.toml untouched" {
  tmp_state="/tmp/mostly-bats-state-$$"
  tmp_toml="/tmp/mostly-bats-toml-$$"
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  toml_before=$(cat "$tmp_toml")
  rm -f "$tmp_state"
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" init \
    --admin-handle admin --admin-password pw --dry-run
  [ "$status" -eq 0 ]
  # Dry-run prints would-run: lines on stderr; bats `run` captures both.
  [[ "$output" == *"would-run: wrangler whoami"* ]]
  [[ "$output" == *"would-run: wrangler d1 create"* ]]
  [[ "$output" == *"would-run: wrangler d1 migrations apply"* ]]
  [[ "$output" == *"would-run: wrangler d1 execute"* ]]
  [[ "$output" == *"would-run: patch_wrangler_toml_field"* ]]
  # No stub commands should have actually run.
  run cat "$STUB_LOG_FILE"
  [ "$output" = "" ]
  # And the TOML must be unchanged.
  toml_after=$(cat "$tmp_toml")
  [ "$toml_before" = "$toml_after" ]
  rm -f "$tmp_state" "$tmp_toml"
}
