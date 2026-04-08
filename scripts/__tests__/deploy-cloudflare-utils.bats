#!/usr/bin/env bats

load bats-helpers

setup() {
  source "$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh"
}

@test "deploy-cloudflare-utils.sh sources cleanly" {
  :
}

# Helper unit tests land here in subsequent tasks.
