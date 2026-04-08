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
