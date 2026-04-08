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

@test "init --dry-run --admin-handle x --admin-password y --domain foo.bar prints parsed config" {
  run "$SCRIPT_DIR/deploy-cloudflare.sh" init --dry-run --admin-handle admin --admin-password pw --domain mostly.example.com
  # For now we only assert that the script recognizes these flags and exits 0.
  [ "$status" -eq 0 ]
  [[ "$output" == *"init"* ]]
  [[ "$output" == *"admin-handle=admin"* ]]
  [[ "$output" == *"domain=mostly.example.com"* ]]
  [[ "$output" == *"dry_run=1"* ]]
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
