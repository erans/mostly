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
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
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
  [[ "$output" == *"would-run: patch_wrangler_toml_route"* ]]
  [[ "$output" == *"mostly.example.com"* ]]
  [[ "$output" == *"would-write:"*"$tmp_state"* ]]
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

@test "update --dry-run runs the preflight wrangler whoami via run_cmd" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
  cat > "$tmp_state" <<'STATE'
DATABASE_ID=existing-db-id
DATABASE_NAME=mostly-db
WORKSPACE_ID=01WORKSPACE000000000000001
WORKSPACE_SLUG=default
WORKER_NAME=mostly
WORKER_URL=https://mostly.test.workers.dev
ADMIN_HANDLE=admin
DOMAIN=
STATE
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" update --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"would-run: wrangler whoami"* ]]
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
  tmp_state="$BATS_TEST_TMPDIR/state"
  printf 'DATABASE_ID=xyz\n' > "$tmp_state"
  STATE_FILE="$tmp_state" run "$SCRIPT_DIR/deploy-cloudflare.sh" init --admin-handle admin --admin-password pw
  [ "$status" -eq 1 ]
  [[ "$output" == *"already initialized"* ]]
}

@test "init records wrangler d1 create, migrations apply, and workspace seed via stubs" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
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
}

@test "init patches wrangler.toml database_id and WORKSPACE_ID after provisioning" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
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
}

@test "init --dry-run prints would-run lines for every wrangler call and leaves wrangler.toml untouched" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
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
}

@test "init dies with a clear error when wrangler d1 create returns no uuid" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  STUB_WRANGLER_D1_CREATE_BAD=1 STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" \
    run "$SCRIPT_DIR/deploy-cloudflare.sh" init --admin-handle admin --admin-password pw
  [ "$status" -eq 1 ]
  [[ "$output" == *"could not parse database_id"* ]]
}

@test "init records pnpm build calls for web and server via stubs" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" init \
    --admin-handle admin --admin-password pw
  [ "$status" -eq 0 ]
  run cat "$STUB_LOG_FILE"
  [[ "$output" == *"pnpm --filter @mostly/web build"* ]]
  [[ "$output" == *"pnpm --filter @mostly/server build:worker"* ]]
  [[ "$output" == *"wrangler deploy"* ]]
}

@test "init records register and api-keys curl calls via stubs" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" init \
    --admin-handle admin --admin-password pw
  [ "$status" -eq 0 ]
  run cat "$STUB_LOG_FILE"
  [[ "$output" == *"curl"* ]]
  [[ "$output" == *"/v0/auth/register"* ]]
  [[ "$output" == *"/v0/auth/api-keys"* ]]
  [[ "$output" == *"UPDATE workspace SET agent_token_hash"* ]]
}

@test "init writes .cloudflare.env on success" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" init \
    --admin-handle admin --admin-password pw
  [ "$status" -eq 0 ]
  [ -f "$tmp_state" ]
  run cat "$tmp_state"
  [[ "$output" == *"DATABASE_ID='00000000-0000-0000-0000-000000000001'"* ]]
  [[ "$output" == *"WORKSPACE_ID='01WORKSPACE000000000000001'"* ]]
  [[ "$output" == *"WORKER_URL='https://mostly.test.workers.dev'"* ]]
  [[ "$output" == *"ADMIN_HANDLE='admin'"* ]]
}

@test "init prints the admin API key and agent token in the summary" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" init \
    --admin-handle admin --admin-password pw
  [ "$status" -eq 0 ]
  [[ "$output" == *"msk_stub"* ]]
  [[ "$output" == *"mat_deadbeefcafed00d"* ]]
}

@test "init --dry-run prints would-run lines for build/deploy/bootstrap and writes nothing" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" init \
    --admin-handle admin --admin-password pw --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"would-run: pnpm --filter @mostly/web build"* ]]
  [[ "$output" == *"would-run: pnpm --filter @mostly/server build:worker"* ]]
  [[ "$output" == *"would-run: wrangler deploy"* ]]
  [[ "$output" == *"would-run: curl"*"/v0/auth/register"* ]]
  [[ "$output" == *"would-run: curl"*"/v0/auth/api-keys"* ]]
  [[ "$output" == *"would-run: openssl rand"* ]]
  [[ "$output" == *"would-run: openssl dgst"* ]]
  [[ "$output" == *"would-run: wrangler d1 execute"*"UPDATE workspace SET agent_token_hash"* ]]
  [[ "$output" == *"would-write:"*"$tmp_state"* ]]
  # Stub log must be empty: nothing should have actually run.
  run cat "$STUB_LOG_FILE"
  [ "$output" = "" ]
  # And the state file must not exist.
  [ ! -f "$tmp_state" ]
}

@test "init --dry-run never puts the admin password in the dry-run trace" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  # Use a recognizable password so a substring scan of the trace is conclusive.
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" init \
    --admin-handle admin --admin-password 'unique-trace-canary-pw' --dry-run
  [ "$status" -eq 0 ]
  # The register call must use -d @<file>, not -d <body>, so the would-run
  # line shows only the file path and never the plaintext password.
  [[ "$output" != *"unique-trace-canary-pw"* ]]
  [[ "$output" == *"would-run: curl"*"-d @"* ]]
}

@test "DRY_RUN=true env var (not --dry-run flag) still leaves the state file alone" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  DRY_RUN=true STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" \
    run "$SCRIPT_DIR/deploy-cloudflare.sh" init --admin-handle admin --admin-password pw
  [ "$status" -eq 0 ]
  # The state file must not exist — the write must be gated on the same
  # predicate as run_cmd/run_cmd_capture, which accept true/yes as well as 1.
  [ ! -f "$tmp_state" ]
  [[ "$output" == *"would-write:"*"$tmp_state"* ]]
}

@test "init rejects a malformed agent hash from openssl" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  STUB_OPENSSL_DGST_BAD=1 STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" \
    run "$SCRIPT_DIR/deploy-cloudflare.sh" init --admin-handle admin --admin-password pw
  [ "$status" -eq 1 ]
  [[ "$output" == *"malformed sha256 hash"* ]]
}

@test "update refuses to run when .cloudflare.env is missing" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  STATE_FILE="$tmp_state" run "$SCRIPT_DIR/deploy-cloudflare.sh" update
  [ "$status" -eq 1 ]
  [[ "$output" == *"not initialized"* ]]
}

@test "update applies migrations, builds, and deploys" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
  cat > "$tmp_state" <<'STATE'
DATABASE_ID=existing-db-id
DATABASE_NAME=mostly-db
WORKSPACE_ID=01WORKSPACE000000000000001
WORKSPACE_SLUG=default
WORKER_NAME=mostly
WORKER_URL=https://mostly.test.workers.dev
ADMIN_HANDLE=admin
DOMAIN=
STATE
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" update
  [ "$status" -eq 0 ]
  run cat "$STUB_LOG_FILE"
  [[ "$output" == *"wrangler d1 migrations apply"* ]]
  [[ "$output" == *"pnpm --filter @mostly/web build"* ]]
  [[ "$output" == *"pnpm --filter @mostly/server build:worker"* ]]
  [[ "$output" == *"wrangler deploy"* ]]
  # update should NOT call register, api-keys, or UPDATE workspace
  [[ "$output" != *"/v0/auth/register"* ]]
  [[ "$output" != *"/v0/auth/api-keys"* ]]
  [[ "$output" != *"UPDATE workspace SET agent_token_hash"* ]]
}

@test "update reconciles wrangler.toml from the state file" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
  cat > "$tmp_state" <<'STATE'
DATABASE_ID=reconcile-me
DATABASE_NAME=mostly-db
WORKSPACE_ID=01WORKSPACE000000000000001
WORKSPACE_SLUG=default
WORKER_NAME=mostly
WORKER_URL=https://mostly.test.workers.dev
ADMIN_HANDLE=admin
DOMAIN=
STATE
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" update
  [ "$status" -eq 0 ]
  run grep 'database_id' "$tmp_toml"
  [[ "$output" == *'database_id = "reconcile-me"'* ]]
  run grep 'WORKSPACE_ID' "$tmp_toml"
  [[ "$output" == *'WORKSPACE_ID = "01WORKSPACE000000000000001"'* ]]
}

@test "update --dry-run prints would-run lines and leaves wrangler.toml untouched" {
  tmp_state="$BATS_TEST_TMPDIR/state"
  tmp_toml="$BATS_TEST_TMPDIR/toml"
  cat > "$tmp_state" <<'STATE'
DATABASE_ID=existing-db-id
DATABASE_NAME=mostly-db
WORKSPACE_ID=01WORKSPACE000000000000001
WORKSPACE_SLUG=default
WORKER_NAME=mostly
WORKER_URL=https://mostly.test.workers.dev
ADMIN_HANDLE=admin
DOMAIN=
STATE
  cat > "$tmp_toml" <<'TOML'
[[d1_databases]]
database_id = ""
[vars]
WORKSPACE_ID = ""
TOML
  toml_before=$(cat "$tmp_toml")
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run "$SCRIPT_DIR/deploy-cloudflare.sh" update --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"would-run: wrangler whoami"* ]]
  [[ "$output" == *"would-run: wrangler d1 migrations apply"* ]]
  [[ "$output" == *"would-run: pnpm --filter @mostly/web build"* ]]
  [[ "$output" == *"would-run: pnpm --filter @mostly/server build:worker"* ]]
  [[ "$output" == *"would-run: wrangler deploy"* ]]
  [[ "$output" == *"would-run: patch_wrangler_toml_field"* ]]
  run cat "$STUB_LOG_FILE"
  [ "$output" = "" ]
  toml_after=$(cat "$tmp_toml")
  [ "$toml_before" = "$toml_after" ]
}
