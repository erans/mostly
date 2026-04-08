# Cloudflare Provisioner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/deploy-cloudflare.sh` with `init` / `update` / `destroy` subcommands that provision Mostly on Cloudflare Workers + D1, serving both the `/v0/*` API and the React frontend from a single Worker via Workers Static Assets.

**Architecture:** A bash entry-point script that sources a helper library and calls out to `wrangler`, `curl`, `pnpm`, and `openssl`. State persists in a gitignored `.cloudflare.env` file. Tests use bats-core with command stubs on PATH so the script can be unit-tested without a Cloudflare account.

**Tech Stack:** bash 5+, [wrangler](https://developers.cloudflare.com/workers/wrangler/), [bats-core](https://github.com/bats-core/bats-core), [shellcheck](https://www.shellcheck.net/), pnpm, existing Vite + tsup toolchain in the monorepo.

**Spec:** `docs/superpowers/specs/2026-04-07-cloudflare-provisioner-design.md`

**Note on testing framework:** The spec says "shellspec" but this plan uses **bats-core** instead. bats-core is available via `apt-get install bats` on Ubuntu (used by CI), is a single binary, and its DSL is simpler than shellspec's. The choice is cosmetic — both would work. The spec's intent is "bash-native unit tests with command stubs."

---

## File Structure

**New files:**

- `scripts/deploy-cloudflare.sh` — entry-point script, dispatches to `cmd_init` / `cmd_update` / `cmd_destroy`
- `scripts/lib/deploy-cloudflare-utils.sh` — sourced helpers (logging, state, wrangler.toml patching, validation, retry)
- `scripts/__tests__/deploy-cloudflare.bats` — bats tests for the entry-point script (argument parsing, subcommand dispatch, subcommand flows with stubs)
- `scripts/__tests__/deploy-cloudflare-utils.bats` — bats tests for helpers (unit-level)
- `scripts/__tests__/bats-helpers.bash` — small shared bats helpers (setup/teardown, stub PATH setup)
- `scripts/stubs/wrangler` — fake wrangler that records invocations and emits canned output
- `scripts/stubs/curl` — fake curl
- `scripts/stubs/pnpm` — fake pnpm
- `scripts/stubs/openssl` — fake openssl
- `scripts/smoke-test-cloudflare.md` — manual checklist for pre-release smoke testing

**Modified files:**

- `.gitignore` — add `.cloudflare.env`
- `wrangler.toml` — add `[assets]` block with `directory`, `binding`, `not_found_handling`, `run_worker_first`
- `packages/server/src/worker.ts` — add `ASSETS` to `Env`, call new `shouldFallThroughToAssets()` helper, fall through to `env.ASSETS.fetch(request)` when the Hono app returns 404 for a non-API path
- `packages/server/src/worker.ts` — also export the helper so it can be unit-tested
- `packages/server/__tests__/worker.test.ts` — new test file (or add to existing one), covers the fall-through helper
- `packages/web/src/hooks/use-config.tsx` — detect `import.meta.env.VITE_SINGLE_ORIGIN === 'true'` at startup and synthesize a config from `window.location.origin` so SetupScreen is skipped
- `docs/cloudflare-deployment.md` — rewrite: lead with the script, move manual walkthrough to an appendix
- `README.md` — two-line update in the deployment section pointing at the script
- `.github/workflows/e2e.yml` — add `deploy-script` job that runs shellcheck + bats
- `docs/superpowers/specs/2026-04-07-cloudflare-provisioner-design.md` — flip status to `Implemented (YYYY-MM-DD)` at the end

---

## Conventions

- **Commit frequently.** Every task ends in a commit. Don't batch multiple tasks into one commit.
- **TDD for helpers.** When a task adds a bash helper function, the test comes first.
- **Exact paths.** All paths in this plan are relative to the worktree root, which is the repo root.
- **Run tests from the worktree root.** `pnpm` commands always run from the worktree root (pnpm is the workspace manager). `bats` commands run from the worktree root and point at `scripts/__tests__/`.
- **Do not push** until all tasks are complete and a final review has been done.

---

## Phase 1: Repo pre-work

These three tasks shape the repo so the single-worker-serves-both model works. They land before the script itself so the script has a working target.

---

### Task 1: Add `.cloudflare.env` to .gitignore and `[assets]` block to wrangler.toml

**Files:**
- Modify: `.gitignore`
- Modify: `wrangler.toml`

- [ ] **Step 1: Read current .gitignore**

Run: `cat .gitignore`
Note whatever's currently in the file so you don't clobber it.

- [ ] **Step 2: Add `.cloudflare.env` to .gitignore**

Append to `.gitignore` (create if missing):

```
# Cloudflare deployment state (populated by scripts/deploy-cloudflare.sh init)
.cloudflare.env
```

- [ ] **Step 3: Verify the ignore works**

Run:
```bash
touch .cloudflare.env
git status --short .cloudflare.env
rm .cloudflare.env
```
Expected: no output from `git status --short` (means the file is ignored).

- [ ] **Step 4: Read current wrangler.toml**

Run: `cat wrangler.toml`
Expected content (at start of task):
```toml
name = "mostly"
main = "packages/server/dist/worker.js"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "mostly-db"
database_id = ""
migrations_dir = "packages/db/migrations"

[vars]
WORKSPACE_ID = ""
```

- [ ] **Step 5: Add `[assets]` block to wrangler.toml**

Rewrite `wrangler.toml` to:

```toml
name = "mostly"
main = "packages/server/dist/worker.js"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "mostly-db"
database_id = ""
migrations_dir = "packages/db/migrations"

[vars]
WORKSPACE_ID = ""

[assets]
directory = "packages/web/dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/v0/*"]
```

Explanation for the reader:
- `directory` is where `pnpm --filter @mostly/web build` emits static files.
- `binding = "ASSETS"` exposes the `env.ASSETS.fetch(request)` method to the worker.
- `not_found_handling = "single-page-application"` tells Cloudflare to return `index.html` for unknown paths so React Router's client-side routes work after a direct page load or refresh.
- `run_worker_first = ["/v0/*"]` sends API requests to the worker; everything else goes straight to static assets without booting the worker.

- [ ] **Step 6: Verify wrangler accepts the new config**

Run:
```bash
pnpm --filter @mostly/server build:worker
mkdir -p packages/web/dist
echo "<!doctype html><html><body>placeholder</body></html>" > packages/web/dist/index.html
pnpm exec wrangler deploy --dry-run 2>&1 | tail -20
```

Expected: no error about unknown keys in `wrangler.toml`. You should see lines about Total Upload, Assets, etc. If `wrangler` refuses the `[assets]` block with an error, there is a wrangler version mismatch — check `pnpm exec wrangler --version` (needs 3.80+ for `run_worker_first`).

Clean up the placeholder:
```bash
rm packages/web/dist/index.html
rmdir packages/web/dist 2>/dev/null || true
```

- [ ] **Step 7: Commit**

```bash
git add .gitignore wrangler.toml
git commit -m "feat(deploy): gitignore state file and add assets block to wrangler.toml"
```

---

### Task 2: Worker fall-through helper for static assets

**Files:**
- Modify: `packages/server/src/worker.ts`
- Create: `packages/server/__tests__/worker.test.ts`

This task extracts a small pure helper, `shouldFallThroughToAssets`, from the worker's fetch handler, tests it in isolation, then wires the worker's fetch handler to use it and call `env.ASSETS.fetch(request)` when the helper says to.

- [ ] **Step 1: Read current worker.ts**

Run: `cat packages/server/src/worker.ts`
Expected content (before edits):

```typescript
import { createD1Db, createRepositories, createD1TransactionManager } from '@mostly/db';
import { PrincipalService, ProjectService, TaskService, MaintenanceService, AuthService } from '@mostly/core';
import { createApp } from './app.js';

interface Env {
  DB: unknown;
  WORKSPACE_ID: string;
}

type D1Arg = Parameters<typeof createD1Db>[0];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = createD1Db(env.DB as D1Arg);
    const repos = createRepositories(db);
    const tx = createD1TransactionManager(db);

    const principalService = new PrincipalService(repos.principals);
    const projectService = new ProjectService(repos.projects);
    const taskService = new TaskService(repos.tasks, repos.taskUpdates, repos.projects, tx);
    const maintenanceService = new MaintenanceService(repos.tasks, repos.taskUpdates, tx);
    const authService = new AuthService(repos.principals, repos.workspaces, repos.sessions, repos.apiKeys);

    const app = createApp({
      workspaceId: env.WORKSPACE_ID,
      principalService,
      projectService,
      taskService,
      maintenanceService,
      authService,
    });

    return app.fetch(request, env);
  },
};
```

- [ ] **Step 2: Write the failing test**

Create `packages/server/__tests__/worker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { shouldFallThroughToAssets } from '../src/worker.js';

describe('shouldFallThroughToAssets', () => {
  it('returns true for a 404 on a non-API path', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/dashboard');
    expect(shouldFallThroughToAssets(response, url)).toBe(true);
  });

  it('returns true for a 404 on the root path', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/');
    expect(shouldFallThroughToAssets(response, url)).toBe(true);
  });

  it('returns false for a 404 on an API path', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/v0/tasks/missing');
    expect(shouldFallThroughToAssets(response, url)).toBe(false);
  });

  it('returns false for a 200 response even on a non-API path', () => {
    const response = new Response('ok', { status: 200 });
    const url = new URL('https://example.com/dashboard');
    expect(shouldFallThroughToAssets(response, url)).toBe(false);
  });

  it('returns false for a 500 response on a non-API path', () => {
    const response = new Response(null, { status: 500 });
    const url = new URL('https://example.com/dashboard');
    expect(shouldFallThroughToAssets(response, url)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @mostly/server test -- worker.test.ts`
Expected: FAIL with "shouldFallThroughToAssets is not exported from ../src/worker.js" or a similar import error.

- [ ] **Step 4: Add the helper and wire it into the fetch handler**

Overwrite `packages/server/src/worker.ts` with:

```typescript
import { createD1Db, createRepositories, createD1TransactionManager } from '@mostly/db';
import { PrincipalService, ProjectService, TaskService, MaintenanceService, AuthService } from '@mostly/core';
import { createApp } from './app.js';

interface Env {
  DB: unknown;
  WORKSPACE_ID: string;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

type D1Arg = Parameters<typeof createD1Db>[0];

/**
 * Decide whether the worker should defer a given response to the static
 * assets binding. The `run_worker_first = ["/v0/*"]` glob in wrangler.toml
 * is the primary router; this helper is a safety net for cases where the
 * worker receives a non-API request anyway (e.g., if someone removes the
 * glob or the runtime evaluates it inconsistently).
 */
export function shouldFallThroughToAssets(response: Response, url: URL): boolean {
  return response.status === 404 && !url.pathname.startsWith('/v0/');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = createD1Db(env.DB as D1Arg);
    const repos = createRepositories(db);
    const tx = createD1TransactionManager(db);

    const principalService = new PrincipalService(repos.principals);
    const projectService = new ProjectService(repos.projects);
    const taskService = new TaskService(repos.tasks, repos.taskUpdates, repos.projects, tx);
    const maintenanceService = new MaintenanceService(repos.tasks, repos.taskUpdates, tx);
    const authService = new AuthService(repos.principals, repos.workspaces, repos.sessions, repos.apiKeys);

    const app = createApp({
      workspaceId: env.WORKSPACE_ID,
      principalService,
      projectService,
      taskService,
      maintenanceService,
      authService,
    });

    const response = await app.fetch(request, env);
    if (shouldFallThroughToAssets(response, new URL(request.url))) {
      return env.ASSETS.fetch(request);
    }
    return response;
  },
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @mostly/server test -- worker.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 6: Run the full server test suite to ensure nothing else broke**

Run: `pnpm --filter @mostly/server test`
Expected: All existing tests still pass (96 tests before + 5 new = 101 passing).

- [ ] **Step 7: Build the worker to verify the new imports compile**

Run: `pnpm --filter @mostly/server build:worker`
Expected: Build succeeds. No TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/worker.ts packages/server/__tests__/worker.test.ts
git commit -m "feat(server): fall through to static assets for non-API 404s"
```

---

### Task 3: Web config detects single-origin builds

**Files:**
- Modify: `packages/web/src/hooks/use-config.tsx`

The web app currently forces the user through `SetupScreen` on first load to enter a server URL. For single-worker deploys, that's pointless friction — the frontend is being served from the same origin as the API. This task adds a three-line escape hatch: when `VITE_SINGLE_ORIGIN=true` is set at build time, `loadConfig()` synthesizes a config pointing at `window.location.origin` and skips localStorage entirely.

There are no unit tests in `packages/web` (no vitest config), and setting one up is out of scope for this task. The change is tiny, pure-conditional, and is covered by the manual smoke test in Task 15.

- [ ] **Step 1: Read current use-config.tsx**

Run: `cat packages/web/src/hooks/use-config.tsx`
Expected: A `loadConfig` function that reads from `localStorage` (see file in the worktree for exact content).

- [ ] **Step 2: Modify `loadConfig` to check `VITE_SINGLE_ORIGIN` first**

In `packages/web/src/hooks/use-config.tsx`, change the `loadConfig` function from:

```typescript
function loadConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Reject any stale shape from the previous (token + handle) version of
    // this hook. The session now lives in an HttpOnly cookie, so the only
    // thing we still persist client-side is the server URL.
    if (parsed && typeof parsed.serverUrl === 'string' && parsed.serverUrl.length > 0) {
      return { serverUrl: parsed.serverUrl };
    }
    return null;
  } catch {
    return null;
  }
}
```

to:

```typescript
function loadConfig(): AppConfig | null {
  // When the web app is built for a single-worker Cloudflare deploy
  // (VITE_SINGLE_ORIGIN=true at build time), the frontend is being served
  // from the same origin as the API. Skip SetupScreen entirely and use
  // window.location.origin. This path does not touch localStorage — the
  // build flag is the source of truth.
  if (import.meta.env.VITE_SINGLE_ORIGIN === 'true') {
    return { serverUrl: window.location.origin };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Reject any stale shape from the previous (token + handle) version of
    // this hook. The session now lives in an HttpOnly cookie, so the only
    // thing we still persist client-side is the server URL.
    if (parsed && typeof parsed.serverUrl === 'string' && parsed.serverUrl.length > 0) {
      return { serverUrl: parsed.serverUrl };
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Build the web package with VITE_SINGLE_ORIGIN=true to verify it compiles**

Run: `VITE_SINGLE_ORIGIN=true pnpm --filter @mostly/web build`
Expected: Vite compiles without type errors. Dist files land in `packages/web/dist/`.

- [ ] **Step 4: Inspect the built bundle to confirm the flag was baked in**

Run: `grep -l "VITE_SINGLE_ORIGIN\|window.location.origin" packages/web/dist/assets/*.js 2>/dev/null | head -3`
Expected: At least one bundled JS file should contain `window.location.origin`. (Vite will have replaced `import.meta.env.VITE_SINGLE_ORIGIN === 'true'` with the literal `true` during the build, so the string `VITE_SINGLE_ORIGIN` will likely be absent from the output — that's fine; `window.location.origin` is the reliable grep target.)

- [ ] **Step 5: Build without the flag to verify the default path still works**

Run: `pnpm --filter @mostly/web build`
Expected: Build succeeds. The SetupScreen-based path is unchanged when the flag is unset.

- [ ] **Step 6: Clean build artifacts**

Run: `rm -rf packages/web/dist`
(Keeps the git diff small; builds are regenerated later.)

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/hooks/use-config.tsx
git commit -m "feat(web): skip SetupScreen when VITE_SINGLE_ORIGIN=true"
```

---

## Phase 2: Script scaffolding and helpers

The rest of the work builds the script itself. Phase 2 sets up the test infrastructure and lands the unit-tested helpers. Phase 3 wires the helpers into `init` / `update` / `destroy` subcommands and tests them end-to-end with stubs.

---

### Task 4: Scripts directory layout, bats infrastructure, and stubs

**Files:**
- Create: `scripts/deploy-cloudflare.sh`
- Create: `scripts/lib/deploy-cloudflare-utils.sh`
- Create: `scripts/__tests__/bats-helpers.bash`
- Create: `scripts/__tests__/deploy-cloudflare-utils.bats`
- Create: `scripts/__tests__/deploy-cloudflare.bats`
- Create: `scripts/stubs/wrangler`
- Create: `scripts/stubs/curl`
- Create: `scripts/stubs/pnpm`
- Create: `scripts/stubs/openssl`

This task creates the skeleton: empty-ish script files with just a shebang and a `main` dispatcher, the bats helper module, and stub commands that record invocations to a file. The helper file and the entry-point script are both empty-but-valid at the end of this task. Real logic lands in subsequent tasks.

- [ ] **Step 1: Create the scripts directory structure**

Run:
```bash
mkdir -p scripts/lib scripts/__tests__ scripts/stubs
```

- [ ] **Step 2: Install bats-core locally for development**

Run:
```bash
which bats || { echo "bats not found — install with: sudo apt-get install -y bats   (or: brew install bats-core)"; }
bats --version
```
Expected: `Bats <version>`. If bats is missing, install it per the hint and re-run. On Ubuntu the apt package is usually 1.2+; on macOS brew installs 1.10+. Either is fine.

- [ ] **Step 3: Create the helper file skeleton**

Create `scripts/lib/deploy-cloudflare-utils.sh`:

```bash
#!/usr/bin/env bash
#
# Shared helpers for scripts/deploy-cloudflare.sh. Sourced, not executed.
#
# Functions defined in this file:
#   require_cmd <name>             — exit if a command is missing from PATH
#   require_file <path>            — exit if a file is missing
#   log_step <message>             — print a progress line, set CURRENT_STEP
#   log_warn <message>             — print a warning to stderr
#   die <message>                  — print an error and exit 1
#   read_state <path>              — source a state file, die if missing
#   write_state <path> <k>=<v>...  — write a key/value state file
#   validate_slug <value>          — enforce [a-z][a-z0-9-]{0,62}
#   patch_wrangler_toml_field <path> <key> <value>
#   patch_wrangler_toml_route <path> <domain>
#   unpatch_wrangler_toml_route <path>
#   parse_deploy_url <stdout>      — extract the deployed URL from wrangler output
#   retry_once <delay_seconds> <cmd...>
#   run_cmd <cmd...>               — run, or print "would-run:" if DRY_RUN=1
#   run_cmd_capture <canned> <cmd...> — capture stdout, or emit canned in dry-run
#
# All functions write errors to stderr, not stdout.

set -euo pipefail
IFS=$'\n\t'

# Populated by log_step, consumed by the trap in the entry-point script.
CURRENT_STEP="(not started)"
```

- [ ] **Step 4: Create the entry-point script skeleton**

Create `scripts/deploy-cloudflare.sh` and make it executable:

```bash
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
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=lib/deploy-cloudflare-utils.sh
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
```

Make it executable:
```bash
chmod +x scripts/deploy-cloudflare.sh
```

- [ ] **Step 5: Create the bats helper file**

Create `scripts/__tests__/bats-helpers.bash`:

```bash
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
  STUBS_LOG_DIR="$(mktemp -d)"
  export STUBS_DIR STUBS_LOG_DIR
  export STUB_LOG_FILE="$STUBS_LOG_DIR/invocations.log"
  : > "$STUB_LOG_FILE"
  export PATH="$STUBS_DIR:$PATH"
}

teardown_stubs() {
  if [[ -n "${STUBS_LOG_DIR:-}" && -d "$STUBS_LOG_DIR" ]]; then
    rm -rf "$STUBS_LOG_DIR"
  fi
}

# Return the nth recorded stub invocation line (1-indexed).
stub_invocation() {
  local n="$1"
  sed -n "${n}p" "$STUB_LOG_FILE"
}

# Total number of recorded stub invocations.
stub_invocation_count() {
  wc -l < "$STUB_LOG_FILE" | tr -d ' '
}
```

- [ ] **Step 6: Create the command stubs**

Each stub is a tiny bash script that appends its command line to `$STUB_LOG_FILE` (if set) and returns canned output based on its arguments.

Create `scripts/stubs/wrangler`:

```bash
#!/usr/bin/env bash
# Fake wrangler: records invocations and emits canned output for tests.

if [[ -n "${STUB_LOG_FILE:-}" ]]; then
  echo "wrangler $*" >> "$STUB_LOG_FILE"
fi

case "$1" in
  whoami)
    echo "You are logged in as test@example.com"
    ;;
  d1)
    case "$2" in
      create)
        # wrangler d1 create --json → {"name":"mostly-db","uuid":"00000000-0000-0000-0000-000000000001"}
        if [[ " $* " == *" --json "* ]]; then
          echo '{"name":"mostly-db","uuid":"00000000-0000-0000-0000-000000000001"}'
        else
          echo "✅ Created DB 'mostly-db' (00000000-0000-0000-0000-000000000001)"
        fi
        ;;
      migrations)
        echo "Migrations applied: 0000_brief_toxin.sql, 0001_youthful_mother_askani.sql"
        ;;
      execute)
        echo "🚣 Executed 1 command"
        ;;
      delete)
        echo "✅ Deleted database 'mostly-db'"
        ;;
      *)
        echo "stub wrangler: unknown d1 subcommand $2" >&2
        exit 1
        ;;
    esac
    ;;
  deploy)
    # A recognizable fake deployed URL the script can parse.
    cat <<'OUT'
 ⛅️ wrangler 3.85.0
-------------------
Total Upload: 100.00 KiB / gzip: 30.00 KiB
Uploaded mostly (1.23 sec)
Published mostly (0.45 sec)
  https://mostly.test.workers.dev
Current Deployment ID: 00000000-0000-0000-0000-0000000000aa
OUT
    ;;
  delete)
    echo "✅ Worker mostly deleted"
    ;;
  *)
    echo "stub wrangler: unknown command $*" >&2
    exit 1
    ;;
esac
```

Create `scripts/stubs/curl`:

```bash
#!/usr/bin/env bash
# Fake curl: records invocations and emits canned JSON bodies for the
# /v0/auth/register and /v0/auth/api-keys calls the deploy script makes.

if [[ -n "${STUB_LOG_FILE:-}" ]]; then
  echo "curl $*" >> "$STUB_LOG_FILE"
fi

# Last positional arg is the URL for the calls we care about.
url=""
for arg in "$@"; do
  case "$arg" in
    http://*|https://*) url="$arg" ;;
  esac
done

# Write a fake Set-Cookie header if -c <file> is given (cookie jar), so the
# downstream -b <same-file> call has something to consume.
cookie_file=""
prev=""
for arg in "$@"; do
  if [[ "$prev" == "-c" ]]; then
    cookie_file="$arg"
  fi
  prev="$arg"
done
if [[ -n "$cookie_file" ]]; then
  printf 'mostly.test.workers.dev\tFALSE\t/\tTRUE\t0\tmostly_session\tfake-session\n' > "$cookie_file"
fi

case "$url" in
  *"/v0/auth/register")
    echo '{"principal":{"id":"01STUB_ADMIN","handle":"admin","display_name":"admin"}}'
    ;;
  *"/v0/auth/login")
    echo '{"principal":{"id":"01STUB_ADMIN","handle":"admin","display_name":"admin"}}'
    ;;
  *"/v0/auth/api-keys")
    echo '{"id":"01STUB_KEY","name":"admin-cli","key":"msk_stub000000000000000000000000000000000000000000000000000000000000"}'
    ;;
  *)
    echo '{"ok":true}'
    ;;
esac
```

Create `scripts/stubs/pnpm`:

```bash
#!/usr/bin/env bash
# Fake pnpm: records invocations and emits a success line for build calls.

if [[ -n "${STUB_LOG_FILE:-}" ]]; then
  echo "pnpm $*" >> "$STUB_LOG_FILE"
fi

echo "(stub) pnpm $*"
exit 0
```

Create `scripts/stubs/openssl`:

```bash
#!/usr/bin/env bash
# Fake openssl: records invocations, emits deterministic canned output.

if [[ -n "${STUB_LOG_FILE:-}" ]]; then
  echo "openssl $*" >> "$STUB_LOG_FILE"
fi

case "$1" in
  rand)
    # openssl rand -hex 32 → deterministic fake hex (64 chars)
    echo "deadbeefcafed00dfeedfacebeeff00ddeadbeefcafed00dfeedfacebeeff00d"
    ;;
  dgst)
    # openssl dgst -sha256 -hex → "(stdin)= <hex>"
    echo "(stdin)= fabfabfabfabfabfabfabfabfabfabfabfabfabfabfabfabfabfabfabfabfabe"
    ;;
  *)
    echo "stub openssl: unknown command $*" >&2
    exit 1
    ;;
esac
```

- [ ] **Step 7: Make all stubs executable**

Run:
```bash
chmod +x scripts/stubs/wrangler scripts/stubs/curl scripts/stubs/pnpm scripts/stubs/openssl
```

- [ ] **Step 8: Create empty bats test files**

Create `scripts/__tests__/deploy-cloudflare-utils.bats`:

```bash
#!/usr/bin/env bats

load bats-helpers

setup() {
  source "$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh"
}

# Helper unit tests land here in subsequent tasks.
```

Create `scripts/__tests__/deploy-cloudflare.bats`:

```bash
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
```

- [ ] **Step 9: Run the bats tests**

Run: `bats scripts/__tests__/`
Expected: 3 tests pass (the `-utils.bats` file has 0 tests and should report "No tests to run" or exit 0 silently depending on bats version).

- [ ] **Step 10: Verify shellcheck passes on the skeleton**

Run: `shellcheck scripts/deploy-cloudflare.sh scripts/lib/deploy-cloudflare-utils.sh scripts/stubs/*`
Expected: No errors. (Some stubs may trigger SC2086 for `$*` logging; if so, quote it: `echo "wrangler $*"` is already quoted, fine.)

- [ ] **Step 11: Commit**

```bash
git add scripts/
git commit -m "feat(deploy): scaffold deploy-cloudflare.sh skeleton and bats infrastructure"
```

---

### Task 5: Logging and preflight helpers

**Files:**
- Modify: `scripts/lib/deploy-cloudflare-utils.sh`
- Modify: `scripts/__tests__/deploy-cloudflare-utils.bats`

Add five helpers: `require_cmd`, `require_file`, `log_step`, `log_warn`, `die`. These are foundational — every subcommand uses them. Each gets a bats unit test.

- [ ] **Step 1: Write failing tests for the logging helpers**

Append to `scripts/__tests__/deploy-cloudflare-utils.bats`:

```bash
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats scripts/__tests__/deploy-cloudflare-utils.bats`
Expected: 7 new tests FAIL (functions not defined).

- [ ] **Step 3: Implement the helpers**

Append to `scripts/lib/deploy-cloudflare-utils.sh`:

```bash
log_step() {
  local message="$1"
  CURRENT_STEP="$message"
  printf '==> %s\n' "$message" >&2
}

log_warn() {
  local message="$1"
  printf '[WARN] %s\n' "$message" >&2
}

die() {
  local message="$1"
  printf '[ERROR] %s\n' "$message" >&2
  exit 1
}

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    die "required command not found: $name (install it or add it to PATH)"
  fi
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    die "required file not found: $path"
  fi
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bats scripts/__tests__/deploy-cloudflare-utils.bats`
Expected: All 7 tests PASS.

- [ ] **Step 5: Run shellcheck**

Run: `shellcheck scripts/lib/deploy-cloudflare-utils.sh`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/deploy-cloudflare-utils.sh scripts/__tests__/deploy-cloudflare-utils.bats
git commit -m "feat(deploy): log_step/log_warn/die and require_cmd/require_file helpers"
```

---

### Task 6: State file and slug validation helpers

**Files:**
- Modify: `scripts/lib/deploy-cloudflare-utils.sh`
- Modify: `scripts/__tests__/deploy-cloudflare-utils.bats`

Add three helpers: `read_state`, `write_state`, `validate_slug`. These manage the `.cloudflare.env` file and validate user-supplied identifiers.

- [ ] **Step 1: Write failing tests**

Append to `scripts/__tests__/deploy-cloudflare-utils.bats`:

```bash
@test "write_state writes KEY=value lines in the order given" {
  tmp=$(mktemp)
  run bash -c "source '$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh' && write_state '$tmp' DATABASE_ID=abc WORKSPACE_ID=def WORKER_URL=https://x.workers.dev"
  [ "$status" -eq 0 ]
  run cat "$tmp"
  [ "$output" = "DATABASE_ID=abc
WORKSPACE_ID=def
WORKER_URL=https://x.workers.dev" ]
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats scripts/__tests__/deploy-cloudflare-utils.bats`
Expected: 10 new tests FAIL.

- [ ] **Step 3: Implement the helpers**

Append to `scripts/lib/deploy-cloudflare-utils.sh`:

```bash
# Write a KEY=value state file. Each argument after the first is a
# KEY=VALUE pair. Rejects values containing single quotes because the
# file is meant to be `source`-able and a quoted value with embedded
# single quotes would need escaping we don't want to deal with.
write_state() {
  local path="$1"
  shift
  local pair
  for pair in "$@"; do
    if [[ "$pair" == *"'"* ]]; then
      die "write_state: refusing to write value containing a single quote: $pair"
    fi
  done
  : > "$path"
  for pair in "$@"; do
    printf '%s\n' "$pair" >> "$path"
  done
}

# Source a state file into the current shell. Dies if the file doesn't
# exist. Used by update and destroy to read init's state.
read_state() {
  local path="$1"
  require_file "$path"
  # shellcheck disable=SC1090
  source "$path"
}

# Enforce a DNS-ish slug: lowercase letter first, then letters/digits/hyphens,
# max 63 chars. Rejects anything else. Used for --workspace-slug and
# --admin-handle to keep them safe for SQL interpolation and JSON payloads.
validate_slug() {
  local value="$1"
  if [[ -z "$value" ]]; then
    die "invalid slug: (empty)"
  fi
  if [[ ! "$value" =~ ^[a-z][a-z0-9-]{0,62}$ ]]; then
    die "invalid slug: $value (must match ^[a-z][a-z0-9-]{0,62}\$)"
  fi
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bats scripts/__tests__/deploy-cloudflare-utils.bats`
Expected: All previous tests + 10 new tests PASS.

- [ ] **Step 5: Run shellcheck**

Run: `shellcheck scripts/lib/deploy-cloudflare-utils.sh`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/deploy-cloudflare-utils.sh scripts/__tests__/deploy-cloudflare-utils.bats
git commit -m "feat(deploy): state file read/write and slug validation helpers"
```

---

### Task 7: wrangler.toml patch, deploy URL parser, retry helper, dry-run helpers

**Files:**
- Modify: `scripts/lib/deploy-cloudflare-utils.sh`
- Modify: `scripts/__tests__/deploy-cloudflare-utils.bats`

Six helpers: `patch_wrangler_toml_field` (for `database_id` and `WORKSPACE_ID`), `patch_wrangler_toml_route` (for the optional custom domain block), `unpatch_wrangler_toml_route`, `parse_deploy_url` (extracts the deployed URL from `wrangler deploy` output), `retry_once` (retries a command once after a delay), and the dry-run wrappers `run_cmd` / `run_cmd_capture` that the subcommand functions in Tasks 9–12 use to gate every external command on `DRY_RUN=1`.

- [ ] **Step 1: Write failing tests**

Append to `scripts/__tests__/deploy-cloudflare-utils.bats`:

```bash
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats scripts/__tests__/deploy-cloudflare-utils.bats`
Expected: 17 new tests FAIL.

- [ ] **Step 3: Implement the helpers**

Append to `scripts/lib/deploy-cloudflare-utils.sh`:

```bash
# Patch a single `key = "value"` line in a TOML file in place. Works for
# both `database_id` and `WORKSPACE_ID` because both have the same
# `<key> = "<value>"` shape. The patch is idempotent and preserves all
# other lines exactly.
#
# Implementation: uses a temporary file + awk for portability (sed -i
# differs between GNU and BSD). An empty value is explicitly supported
# so destroy can reset fields to "".
patch_wrangler_toml_field() {
  local path="$1"
  local key="$2"
  local value="$3"
  require_file "$path"
  local tmp
  tmp=$(mktemp)
  awk -v key="$key" -v value="$value" '
    {
      if ($0 ~ "^[[:space:]]*"key"[[:space:]]*=") {
        printf("%s = \"%s\"\n", key, value)
      } else {
        print
      }
    }
  ' "$path" > "$tmp"
  mv "$tmp" "$path"
}

# Append a `route = { pattern = "<domain>/*", custom_domain = true }` line
# to wrangler.toml at the end of file. If a route line already exists, it
# is replaced (so the call is idempotent).
patch_wrangler_toml_route() {
  local path="$1"
  local domain="$2"
  require_file "$path"
  # Strip any existing route line first.
  unpatch_wrangler_toml_route "$path"
  printf '\nroute = { pattern = "%s/*", custom_domain = true }\n' "$domain" >> "$path"
}

# Remove any `route = { ... }` line from wrangler.toml. Safe no-op if
# no such line exists.
unpatch_wrangler_toml_route() {
  local path="$1"
  require_file "$path"
  local tmp
  tmp=$(mktemp)
  grep -v '^route = ' "$path" > "$tmp" || true
  mv "$tmp" "$path"
}

# Parse the deployed URL from `wrangler deploy` stdout. Wrangler prints
# the URL on its own line, indented with two spaces, after lines about
# Upload and Published.
parse_deploy_url() {
  local output="$1"
  local url
  url=$(printf '%s\n' "$output" | grep -oE 'https://[a-zA-Z0-9.-]+(\.workers\.dev|[a-zA-Z]{2,})(/[[:alnum:]_./-]*)?' | head -n1)
  if [[ -z "$url" ]]; then
    die "could not parse deployed URL from wrangler output"
  fi
  printf '%s\n' "$url"
}

# Run a command. If it fails, wait <delay_seconds> and try again once more.
# If the second attempt also fails, return its non-zero exit code.
retry_once() {
  local delay="$1"
  shift
  if "$@"; then
    return 0
  fi
  log_warn "command failed, retrying in ${delay}s: $*"
  sleep "$delay"
  "$@"
}

# Run a command, or print "would-run: <cmd>" to stderr and skip execution
# if DRY_RUN=1 is set in the environment. Use this for fire-and-forget
# external commands whose stdout is not captured. The would-run line goes
# to stderr so that callers can still redirect command stdout (e.g.
# `run_cmd wrangler whoami >/dev/null`) without losing the dry-run trace.
run_cmd() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf 'would-run: %s\n' "$*" >&2
    return 0
  fi
  "$@"
}

# Run a command and emit its stdout, or print "would-run: <cmd>" to
# stderr and emit canned stdout if DRY_RUN=1 is set. Use this for
# external commands whose stdout downstream code parses (e.g.
# `wrangler d1 create --json`, `wrangler deploy`, the curl calls that
# return JSON the script needs to thread through). The first argument
# is the canned stdout; the rest is the command.
run_cmd_capture() {
  local canned="$1"
  shift
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf 'would-run: %s\n' "$*" >&2
    printf '%s' "$canned"
    return 0
  fi
  "$@"
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bats scripts/__tests__/deploy-cloudflare-utils.bats`
Expected: All tests PASS.

- [ ] **Step 5: Run shellcheck**

Run: `shellcheck scripts/lib/deploy-cloudflare-utils.sh`
Expected: No errors. (If shellcheck complains about unused variables in awk due to the quote style, ignore with `# shellcheck disable=SC2016` inline if necessary — but the code above is plain enough that no suppressions should be needed.)

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/deploy-cloudflare-utils.sh scripts/__tests__/deploy-cloudflare-utils.bats
git commit -m "feat(deploy): wrangler.toml patch, deploy URL parser, retry, dry-run helpers"
```

---

## Phase 3: Main script subcommands

With helpers in place, wire them into the three subcommands. Each subcommand gets end-to-end tests that invoke `scripts/deploy-cloudflare.sh` with stubs on PATH and assert on the recorded stub invocations.

---

### Task 8: Argument parser and subcommand dispatch

**Files:**
- Modify: `scripts/deploy-cloudflare.sh`
- Modify: `scripts/__tests__/deploy-cloudflare.bats`

Replace the placeholder `die` calls in `main()` with a real dispatcher that parses subcommand-specific flags and calls `cmd_init` / `cmd_update` / `cmd_destroy`. Each `cmd_*` function in this task is a stub that just prints its parsed arguments — Tasks 9–12 flesh them out.

- [ ] **Step 1: Write failing tests for dry-run argument parsing**

Append to `scripts/__tests__/deploy-cloudflare.bats`:

```bash
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
```

- [ ] **Step 2: Run the tests — they should fail**

Run: `bats scripts/__tests__/deploy-cloudflare.bats`
Expected: 5 new tests FAIL (init/update/destroy still hit `die "not yet implemented"`).

- [ ] **Step 3: Rewrite `scripts/deploy-cloudflare.sh` with dispatchers and parsers**

Overwrite the `main()` and add `cmd_init` / `cmd_update` / `cmd_destroy` function stubs. The full file after this step:

```bash
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=lib/deploy-cloudflare-utils.sh
source "$SCRIPT_DIR/lib/deploy-cloudflare-utils.sh"

# Locations (these can be overridden by env for tests).
STATE_FILE="${STATE_FILE:-$REPO_ROOT/.cloudflare.env}"
WRANGLER_TOML="${WRANGLER_TOML:-$REPO_ROOT/wrangler.toml}"
WORKSPACE_ID_DEFAULT="01WORKSPACE000000000000001"
DATABASE_NAME_DEFAULT="mostly-db"
WORKER_NAME_DEFAULT="mostly"

trap 'on_error $LINENO' ERR
on_error() {
  local line="$1"
  printf '[ERROR] failed at %s (line %s): %s\n' "${CURRENT_STEP:-(unknown)}" "$line" "$0" >&2
}

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

init flags:
  --domain <host>          Install with a custom domain (adds a route block).
  --admin-handle <handle>  Admin user handle (prompted if omitted).
  --admin-password <pw>    Admin password (prompted if omitted).
  --workspace-slug <slug>  Workspace slug (default: default).
  --dry-run                Print intended actions without running them.

update flags:
  --dry-run                Print intended actions without running them.

destroy flags:
  --yes-i-really-mean-it   Required. Without it, destroy prints what would be
                           deleted and exits non-zero.
  --dry-run                Print intended actions without running them.
USAGE
}

cmd_init() {
  local domain=""
  local admin_handle=""
  local admin_password=""
  local workspace_slug="default"
  local dry_run=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain)         domain="$2"; shift 2 ;;
      --admin-handle)   admin_handle="$2"; shift 2 ;;
      --admin-password) admin_password="$2"; shift 2 ;;
      --workspace-slug) workspace_slug="$2"; shift 2 ;;
      --dry-run)        dry_run=1; export DRY_RUN=1; shift ;;
      -h|--help)        usage; exit 0 ;;
      *) die "unknown init flag: $1" ;;
    esac
  done

  validate_slug "$workspace_slug"
  if [[ -n "$admin_handle" ]]; then
    validate_slug "$admin_handle"
  fi

  printf 'init admin-handle=%s domain=%s workspace-slug=%s dry_run=%s\n' \
    "${admin_handle:-<prompt>}" "${domain:-<none>}" "$workspace_slug" "$dry_run"

  # Real logic lands in Task 9 and Task 10. For now this stub is enough to
  # satisfy the argument-parsing tests.
}

cmd_update() {
  local dry_run=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) dry_run=1; export DRY_RUN=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown update flag: $1" ;;
    esac
  done

  printf 'update dry_run=%s\n' "$dry_run"
  # Real logic lands in Task 11.
}

cmd_destroy() {
  local yes_really=0
  local dry_run=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes-i-really-mean-it) yes_really=1; shift ;;
      --dry-run) dry_run=1; export DRY_RUN=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown destroy flag: $1" ;;
    esac
  done

  if [[ $yes_really -ne 1 ]]; then
    die "destroy is destructive — re-run with --yes-i-really-mean-it"
  fi

  printf 'destroy yes_really=%s dry_run=%s\n' "$yes_really" "$dry_run"
  # Real logic lands in Task 12.
}

main() {
  if [[ $# -eq 0 ]]; then
    usage
    exit 1
  fi

  local subcommand="$1"
  shift

  case "$subcommand" in
    init)      cmd_init "$@" ;;
    update)    cmd_update "$@" ;;
    destroy)   cmd_destroy "$@" ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown subcommand: $subcommand" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bats scripts/__tests__/deploy-cloudflare.bats`
Expected: All tests PASS (3 original + 5 new = 8).

- [ ] **Step 5: Run shellcheck**

Run: `shellcheck scripts/deploy-cloudflare.sh`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy-cloudflare.sh scripts/__tests__/deploy-cloudflare.bats
git commit -m "feat(deploy): subcommand dispatch and flag parsing for init/update/destroy"
```

---

### Task 9: `init` — preflight, infrastructure provisioning

**Files:**
- Modify: `scripts/deploy-cloudflare.sh`
- Modify: `scripts/__tests__/deploy-cloudflare.bats`

Flesh out `cmd_init` through step 14 of the spec's init flow: preflight, database creation, migrations, workspace seed, wrangler.toml patches. Tests drive the behavior via stubs.

- [ ] **Step 1: Write failing integration tests**

Append to `scripts/__tests__/deploy-cloudflare.bats`:

```bash
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats scripts/__tests__/deploy-cloudflare.bats`
Expected: 4 new tests FAIL.

- [ ] **Step 3: Implement preflight and provisioning in `cmd_init`**

In `scripts/deploy-cloudflare.sh`, replace the body of `cmd_init` (everything after the `validate_slug "$admin_handle"` block) with the implementation below:

```bash
  # Preflight
  log_step "preflight: required commands"
  require_cmd wrangler
  require_cmd pnpm
  require_cmd curl
  require_cmd openssl
  require_cmd jq

  log_step "preflight: repo root"
  require_file "$WRANGLER_TOML"
  require_file "$REPO_ROOT/packages/server/package.json"
  require_file "$REPO_ROOT/packages/web/package.json"

  log_step "preflight: wrangler authentication"
  run_cmd wrangler whoami >/dev/null

  log_step "preflight: state file must not exist"
  if [[ -f "$STATE_FILE" ]]; then
    die "already initialized (found $STATE_FILE) — use update or destroy instead"
  fi

  # Prompt for missing credentials
  if [[ -z "$admin_handle" ]]; then
    read -rp "admin handle: " admin_handle
    validate_slug "$admin_handle"
  fi
  if [[ -z "$admin_password" ]]; then
    local confirm=""
    read -rsp "admin password: " admin_password
    echo
    read -rsp "confirm password: " confirm
    echo
    if [[ "$admin_password" != "$confirm" ]]; then
      die "passwords do not match"
    fi
  fi

  log_step "create D1 database"
  local create_json database_id
  # In dry-run mode, run_cmd_capture emits this canned JSON so the rest of
  # the script has a database_id to thread through. In real (or stub) mode
  # the canned value is ignored and wrangler's actual stdout is captured.
  create_json=$(run_cmd_capture \
    '{"uuid":"00000000-0000-0000-0000-000000000001","name":"mostly-db"}' \
    wrangler d1 create "$DATABASE_NAME_DEFAULT" --json)
  database_id=$(printf '%s' "$create_json" | jq -r '.uuid')
  if [[ -z "$database_id" || "$database_id" == "null" ]]; then
    die "could not parse database_id from wrangler output: $create_json"
  fi

  log_step "patch wrangler.toml: database_id"
  run_cmd patch_wrangler_toml_field "$WRANGLER_TOML" database_id "$database_id"

  log_step "apply D1 migrations"
  run_cmd wrangler d1 migrations apply "$DATABASE_NAME_DEFAULT" --remote

  log_step "seed workspace row"
  local workspace_id="$WORKSPACE_ID_DEFAULT"
  # validate_slug has already enforced [a-z][a-z0-9-]{0,62} on workspace_slug,
  # so the INSERT cannot break out of the quoted string.
  run_cmd wrangler d1 execute "$DATABASE_NAME_DEFAULT" --remote --command \
    "INSERT OR IGNORE INTO workspace (id, slug, name, created_at, updated_at) VALUES ('$workspace_id', '$workspace_slug', 'Default Workspace', datetime('now'), datetime('now'));"

  log_step "patch wrangler.toml: WORKSPACE_ID"
  run_cmd patch_wrangler_toml_field "$WRANGLER_TOML" WORKSPACE_ID "$workspace_id"

  if [[ -n "$domain" ]]; then
    log_step "patch wrangler.toml: route for $domain"
    run_cmd patch_wrangler_toml_route "$WRANGLER_TOML" "$domain"
  fi

  # Task 10 continues from here (build, deploy, bootstrap, state file, summary).
  printf 'init preflight+provision complete. database_id=%s workspace_id=%s dry_run=%s\n' \
    "$database_id" "$workspace_id" "$dry_run"
```

Note: every external command in this block goes through `run_cmd` /
`run_cmd_capture`, so a `--dry-run` invocation prints `would-run:` lines
to stderr instead of touching Cloudflare. The two `patch_wrangler_toml_*`
calls also flow through `run_cmd` because they mutate the local TOML
file — in dry-run we want to leave the file alone too.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bats scripts/__tests__/deploy-cloudflare.bats`
Expected: All tests PASS.

- [ ] **Step 5: Run shellcheck**

Run: `shellcheck scripts/deploy-cloudflare.sh`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy-cloudflare.sh scripts/__tests__/deploy-cloudflare.bats
git commit -m "feat(deploy): init preflight, D1 creation, migrations, workspace seed"
```

---

### Task 10: `init` — build, deploy, bootstrap, state persistence, summary

**Files:**
- Modify: `scripts/deploy-cloudflare.sh`
- Modify: `scripts/__tests__/deploy-cloudflare.bats`

Complete `cmd_init` with steps 15–24 of the spec: build the web package with `VITE_SINGLE_ORIGIN=true`, build the worker, deploy, register the first admin, mint an API key, install an agent token, persist state, and print the summary. Wire `--dry-run` through every external command in the build/deploy/bootstrap half so that a dry-run invocation prints `would-run:` lines and never touches Cloudflare or the local state file.

- [ ] **Step 1: Write failing tests**

Append to `scripts/__tests__/deploy-cloudflare.bats`:

```bash
@test "init records pnpm build calls for web and server via stubs" {
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
  [[ "$output" == *"pnpm --filter @mostly/web build"* ]]
  [[ "$output" == *"pnpm --filter @mostly/server build:worker"* ]]
  [[ "$output" == *"wrangler deploy"* ]]
  rm -f "$tmp_state" "$tmp_toml"
}

@test "init records register and api-keys curl calls via stubs" {
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
  [[ "$output" == *"curl"* ]]
  [[ "$output" == *"/v0/auth/register"* ]]
  [[ "$output" == *"/v0/auth/api-keys"* ]]
  [[ "$output" == *"UPDATE workspace SET agent_token_hash"* ]]
  rm -f "$tmp_state" "$tmp_toml"
}

@test "init writes .cloudflare.env on success" {
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
  [ -f "$tmp_state" ]
  run cat "$tmp_state"
  [[ "$output" == *"DATABASE_ID=00000000-0000-0000-0000-000000000001"* ]]
  [[ "$output" == *"WORKSPACE_ID=01WORKSPACE000000000000001"* ]]
  [[ "$output" == *"WORKER_URL=https://mostly.test.workers.dev"* ]]
  [[ "$output" == *"ADMIN_HANDLE=admin"* ]]
  rm -f "$tmp_state" "$tmp_toml"
}

@test "init prints the admin API key and agent token in the summary" {
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
  [[ "$output" == *"msk_stub"* ]]
  [[ "$output" == *"mat_deadbeefcafed00d"* ]]
  rm -f "$tmp_state" "$tmp_toml"
}

@test "init --dry-run prints would-run lines for build/deploy/bootstrap and writes nothing" {
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
  rm -f "$tmp_state" "$tmp_toml"
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats scripts/__tests__/deploy-cloudflare.bats`
Expected: 5 new tests FAIL.

- [ ] **Step 3: Complete `cmd_init`**

In `scripts/deploy-cloudflare.sh`, replace the "Task 10 continues from here..." placeholder at the end of `cmd_init` with:

```bash
  log_step "build web package (VITE_SINGLE_ORIGIN=true)"
  ( cd "$REPO_ROOT" && VITE_SINGLE_ORIGIN=true run_cmd pnpm --filter @mostly/web build )

  log_step "build worker bundle"
  ( cd "$REPO_ROOT" && run_cmd pnpm --filter @mostly/server build:worker )

  log_step "deploy worker"
  local deploy_output worker_url
  # In dry-run we substitute a canned wrangler deploy stdout so parse_deploy_url
  # can still extract a URL the rest of the bootstrap depends on.
  deploy_output=$(
    cd "$REPO_ROOT" && run_cmd_capture \
      $' ⛅️ wrangler 0.0.0\n  https://mostly.dry-run.workers.dev\nDeployment ID: dry-run\n' \
      wrangler deploy 2>&1
  )
  printf '%s\n' "$deploy_output"
  worker_url=$(parse_deploy_url "$deploy_output")

  log_step "register first admin"
  local cookie_jar
  cookie_jar=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$cookie_jar'" EXIT

  local register_body
  register_body=$(printf '{"handle":"%s","password":"%s","display_name":"%s"}' \
    "$admin_handle" "$admin_password" "$admin_handle")
  retry_once 2 run_cmd_capture '{"principal":{"id":"01DRY","handle":"admin"}}' \
    curl -sS -c "$cookie_jar" -X POST "$worker_url/v0/auth/register" \
    -H 'Content-Type: application/json' \
    -d "$register_body" >/dev/null

  log_step "mint admin API key"
  local key_response api_key
  key_response=$(retry_once 2 run_cmd_capture \
    '{"id":"01DRY_KEY","name":"admin-cli","key":"msk_dry000000000000000000000000000000000000000000000000000000000000"}' \
    curl -sS -b "$cookie_jar" -X POST "$worker_url/v0/auth/api-keys" \
    -H 'Content-Type: application/json' \
    -d '{"name":"admin-cli"}')
  api_key=$(printf '%s' "$key_response" | jq -r '.key')
  if [[ -z "$api_key" || "$api_key" == "null" ]]; then
    die "could not parse api_key from response: $key_response"
  fi

  log_step "install workspace agent token"
  local agent_token_hex agent_token agent_hash
  agent_token_hex=$(run_cmd_capture \
    'deadbeefcafed00dfeedfacebeeff00ddeadbeefcafed00dfeedfacebeeff00d' \
    openssl rand -hex 32)
  agent_token="mat_$agent_token_hex"
  agent_hash=$(printf %s "$agent_token" | run_cmd_capture \
    '(stdin)= 0000000000000000000000000000000000000000000000000000000000000000' \
    openssl dgst -sha256 -hex | awk '{print $2}')
  run_cmd wrangler d1 execute "$DATABASE_NAME_DEFAULT" --remote --command \
    "UPDATE workspace SET agent_token_hash = '$agent_hash', updated_at = datetime('now') WHERE id = '$workspace_id';"

  log_step "persist state file"
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf 'would-write: %s\n' "$STATE_FILE" >&2
  else
    write_state "$STATE_FILE" \
      "DATABASE_ID=$database_id" \
      "DATABASE_NAME=$DATABASE_NAME_DEFAULT" \
      "WORKSPACE_ID=$workspace_id" \
      "WORKSPACE_SLUG=$workspace_slug" \
      "WORKER_NAME=$WORKER_NAME_DEFAULT" \
      "WORKER_URL=$worker_url" \
      "ADMIN_HANDLE=$admin_handle" \
      "DOMAIN=$domain"
  fi

  log_step "done"
  cat <<EOF

Mostly deployed successfully.

URL:          $worker_url
Admin:        $admin_handle
API key:      $api_key                   (save this — shown only once)
Agent token:  $agent_token                   (save this — shown only once)

Configure your CLI:
  mostly config set server_url $worker_url
  mostly config set api_key $api_key

State saved to $STATE_FILE (gitignored).
EOF
```

Note: every external command in this block goes through `run_cmd` /
`run_cmd_capture`, and the state-file write is gated on `DRY_RUN` so it
emits `would-write:` instead of touching disk. The canned `run_cmd_capture`
stdouts (deploy URL, register response, key response, openssl outputs) are
chosen so the downstream parsing logic still has plausible values to work
with in dry-run mode. In real (or stub-based test) mode the canned
values are ignored.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bats scripts/__tests__/deploy-cloudflare.bats`
Expected: All tests PASS.

- [ ] **Step 5: Run shellcheck**

Run: `shellcheck scripts/deploy-cloudflare.sh`
Expected: No errors. If SC2317 fires on the `trap` line, it's expected — disable it inline.

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy-cloudflare.sh scripts/__tests__/deploy-cloudflare.bats
git commit -m "feat(deploy): init build/deploy/bootstrap/state persistence"
```

---

### Task 11: `update` subcommand

**Files:**
- Modify: `scripts/deploy-cloudflare.sh`
- Modify: `scripts/__tests__/deploy-cloudflare.bats`

`update` is simpler than `init`: read state, reconcile `wrangler.toml`, apply migrations, rebuild, redeploy. It must not touch users, tokens, or workspace data, and must never prompt.

- [ ] **Step 1: Write failing tests**

Append to `scripts/__tests__/deploy-cloudflare.bats`:

```bash
@test "update refuses to run when .cloudflare.env is missing" {
  tmp_state="/tmp/mostly-bats-state-$$"
  rm -f "$tmp_state"
  STATE_FILE="$tmp_state" run "$SCRIPT_DIR/deploy-cloudflare.sh" update
  [ "$status" -eq 1 ]
  [[ "$output" == *"not initialized"* ]]
}

@test "update applies migrations, builds, and deploys" {
  tmp_state="/tmp/mostly-bats-state-$$"
  tmp_toml="/tmp/mostly-bats-toml-$$"
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
  rm -f "$tmp_state" "$tmp_toml"
}

@test "update reconciles wrangler.toml from the state file" {
  tmp_state="/tmp/mostly-bats-state-$$"
  tmp_toml="/tmp/mostly-bats-toml-$$"
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
  rm -f "$tmp_state" "$tmp_toml"
}

@test "update --dry-run prints would-run lines and leaves wrangler.toml untouched" {
  tmp_state="/tmp/mostly-bats-state-$$"
  tmp_toml="/tmp/mostly-bats-toml-$$"
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
  rm -f "$tmp_state" "$tmp_toml"
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats scripts/__tests__/deploy-cloudflare.bats`
Expected: 4 new tests FAIL.

- [ ] **Step 3: Implement `cmd_update`**

In `scripts/deploy-cloudflare.sh`, replace the body of `cmd_update` (everything after the argument parser's `printf 'update ...'` line) with:

```bash
  log_step "preflight: required commands"
  require_cmd wrangler
  require_cmd pnpm

  log_step "preflight: state file"
  read_state "$STATE_FILE"
  if [[ -z "${DATABASE_ID:-}" || -z "${WORKSPACE_ID:-}" || -z "${WORKER_NAME:-}" ]]; then
    die "state file $STATE_FILE is missing required fields"
  fi

  log_step "preflight: wrangler authentication"
  run_cmd wrangler whoami >/dev/null

  log_step "reconcile wrangler.toml from state"
  require_file "$WRANGLER_TOML"
  run_cmd patch_wrangler_toml_field "$WRANGLER_TOML" database_id "$DATABASE_ID"
  run_cmd patch_wrangler_toml_field "$WRANGLER_TOML" WORKSPACE_ID "$WORKSPACE_ID"
  if [[ -n "${DOMAIN:-}" ]]; then
    run_cmd patch_wrangler_toml_route "$WRANGLER_TOML" "$DOMAIN"
  else
    run_cmd unpatch_wrangler_toml_route "$WRANGLER_TOML"
  fi

  log_step "apply D1 migrations"
  run_cmd wrangler d1 migrations apply "$DATABASE_NAME" --remote

  log_step "build web package (VITE_SINGLE_ORIGIN=true)"
  ( cd "$REPO_ROOT" && VITE_SINGLE_ORIGIN=true run_cmd pnpm --filter @mostly/web build )

  log_step "build worker bundle"
  ( cd "$REPO_ROOT" && run_cmd pnpm --filter @mostly/server build:worker )

  log_step "deploy worker"
  local deploy_output new_url
  deploy_output=$(
    cd "$REPO_ROOT" && run_cmd_capture \
      $' ⛅️ wrangler 0.0.0\n  https://mostly.dry-run.workers.dev\nDeployment ID: dry-run\n' \
      wrangler deploy 2>&1
  )
  printf '%s\n' "$deploy_output"
  new_url=$(parse_deploy_url "$deploy_output")

  if [[ "$new_url" != "$WORKER_URL" ]]; then
    log_warn "deployed URL changed from $WORKER_URL to $new_url, updating state"
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
      printf 'would-write: %s\n' "$STATE_FILE" >&2
    else
      # Rewrite WORKER_URL in the state file by re-writing it from scratch.
      write_state "$STATE_FILE" \
        "DATABASE_ID=$DATABASE_ID" \
        "DATABASE_NAME=$DATABASE_NAME" \
        "WORKSPACE_ID=$WORKSPACE_ID" \
        "WORKSPACE_SLUG=${WORKSPACE_SLUG:-default}" \
        "WORKER_NAME=$WORKER_NAME" \
        "WORKER_URL=$new_url" \
        "ADMIN_HANDLE=${ADMIN_HANDLE:-}" \
        "DOMAIN=${DOMAIN:-}"
    fi
  fi

  log_step "done"
  cat <<EOF

Mostly updated.
  URL:         $new_url
  Migrations:  applied
  Worker:      deployed
EOF
```

Leave the `printf 'update ...'` debug line in place at the start of `cmd_update`, or remove it — the tests don't assert on it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bats scripts/__tests__/deploy-cloudflare.bats`
Expected: All tests PASS.

- [ ] **Step 5: Run shellcheck**

Run: `shellcheck scripts/deploy-cloudflare.sh`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy-cloudflare.sh scripts/__tests__/deploy-cloudflare.bats
git commit -m "feat(deploy): update subcommand (apply migrations, rebuild, redeploy)"
```

---

### Task 12: `destroy` subcommand

**Files:**
- Modify: `scripts/deploy-cloudflare.sh`
- Modify: `scripts/__tests__/deploy-cloudflare.bats`

`destroy` needs two safety gates (`--yes-i-really-mean-it` flag + interactive worker-name confirmation), then deletes the worker, deletes the D1 database, removes the state file, and resets `wrangler.toml` placeholders.

- [ ] **Step 1: Write failing tests**

Append to `scripts/__tests__/deploy-cloudflare.bats`:

```bash
@test "destroy without .cloudflare.env exits 1" {
  tmp_state="/tmp/mostly-bats-state-$$"
  rm -f "$tmp_state"
  STATE_FILE="$tmp_state" run "$SCRIPT_DIR/deploy-cloudflare.sh" destroy --yes-i-really-mean-it <<<""
  [ "$status" -eq 1 ]
  [[ "$output" == *"state file"* || "$output" == *"not initialized"* ]]
}

@test "destroy aborts when the confirmation does not match" {
  tmp_state="/tmp/mostly-bats-state-$$"
  tmp_toml="/tmp/mostly-bats-toml-$$"
  cat > "$tmp_state" <<'STATE'
DATABASE_ID=xyz
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
database_id = "xyz"
[vars]
WORKSPACE_ID = "01WORKSPACE000000000000001"
TOML
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run bash -c "echo 'wrong-name' | $SCRIPT_DIR/deploy-cloudflare.sh destroy --yes-i-really-mean-it"
  [ "$status" -eq 0 ]
  [[ "$output" == *"aborted"* ]]
  # Nothing should have been deleted
  [ -f "$tmp_state" ]
  run cat "$STUB_LOG_FILE"
  [[ "$output" != *"wrangler delete"* ]]
  [[ "$output" != *"wrangler d1 delete"* ]]
  rm -f "$tmp_state" "$tmp_toml"
}

@test "destroy with matching confirmation deletes worker, D1, state, and resets wrangler.toml" {
  tmp_state="/tmp/mostly-bats-state-$$"
  tmp_toml="/tmp/mostly-bats-toml-$$"
  cat > "$tmp_state" <<'STATE'
DATABASE_ID=xyz
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
database_id = "xyz"
[vars]
WORKSPACE_ID = "01WORKSPACE000000000000001"
TOML
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run bash -c "echo 'mostly' | $SCRIPT_DIR/deploy-cloudflare.sh destroy --yes-i-really-mean-it"
  [ "$status" -eq 0 ]
  [ ! -f "$tmp_state" ]
  run grep 'database_id' "$tmp_toml"
  [[ "$output" == *'database_id = ""'* ]]
  run grep 'WORKSPACE_ID' "$tmp_toml"
  [[ "$output" == *'WORKSPACE_ID = ""'* ]]
  run cat "$STUB_LOG_FILE"
  [[ "$output" == *"wrangler delete"* ]]
  [[ "$output" == *"wrangler d1 delete mostly-db"* ]]
  rm -f "$tmp_toml"
}

@test "destroy --dry-run prints would-run lines and leaves everything intact" {
  tmp_state="/tmp/mostly-bats-state-$$"
  tmp_toml="/tmp/mostly-bats-toml-$$"
  cat > "$tmp_state" <<'STATE'
DATABASE_ID=xyz
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
database_id = "xyz"
[vars]
WORKSPACE_ID = "01WORKSPACE000000000000001"
TOML
  toml_before=$(cat "$tmp_toml")
  STATE_FILE="$tmp_state" WRANGLER_TOML="$tmp_toml" run bash -c "echo 'mostly' | $SCRIPT_DIR/deploy-cloudflare.sh destroy --yes-i-really-mean-it --dry-run"
  [ "$status" -eq 0 ]
  [[ "$output" == *"would-run: wrangler delete"* ]]
  [[ "$output" == *"would-run: wrangler d1 delete mostly-db"* ]]
  [[ "$output" == *"would-run: patch_wrangler_toml_field"* ]]
  [[ "$output" == *"would-remove:"*"$tmp_state"* ]]
  # The state file must still exist; nothing was deleted.
  [ -f "$tmp_state" ]
  # And the TOML must be unchanged.
  toml_after=$(cat "$tmp_toml")
  [ "$toml_before" = "$toml_after" ]
  # No real wrangler invocations.
  run cat "$STUB_LOG_FILE"
  [ "$output" = "" ]
  rm -f "$tmp_state" "$tmp_toml"
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats scripts/__tests__/deploy-cloudflare.bats`
Expected: 4 new tests FAIL.

- [ ] **Step 3: Implement `cmd_destroy`**

In `scripts/deploy-cloudflare.sh`, add `--dry-run` flag parsing to `cmd_destroy` (alongside `--yes-i-really-mean-it`) and replace the body of `cmd_destroy` (after the `--yes-i-really-mean-it` check) with:

```bash
  log_step "preflight: required commands"
  require_cmd wrangler

  log_step "preflight: state file"
  read_state "$STATE_FILE"
  if [[ -z "${WORKER_NAME:-}" || -z "${DATABASE_NAME:-}" ]]; then
    die "state file $STATE_FILE is missing required fields"
  fi

  cat <<EOF

This will permanently delete:
  - Worker:    $WORKER_NAME
  - Database:  $DATABASE_NAME ($DATABASE_ID)
  - State:     $STATE_FILE

Users, tasks, and API keys will be permanently lost.

EOF
  local confirm
  read -rp "Type the worker name ($WORKER_NAME) to confirm: " confirm
  if [[ "$confirm" != "$WORKER_NAME" ]]; then
    echo "aborted."
    exit 0
  fi

  log_step "delete worker"
  if ! run_cmd wrangler delete; then
    log_warn "wrangler delete failed (worker may already be gone); continuing"
  fi

  log_step "delete D1 database"
  run_cmd wrangler d1 delete "$DATABASE_NAME" --skip-confirmation

  log_step "remove state file"
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf 'would-remove: %s\n' "$STATE_FILE" >&2
  else
    rm -f "$STATE_FILE"
  fi

  log_step "reset wrangler.toml placeholders"
  run_cmd patch_wrangler_toml_field "$WRANGLER_TOML" database_id ""
  run_cmd patch_wrangler_toml_field "$WRANGLER_TOML" WORKSPACE_ID ""
  run_cmd unpatch_wrangler_toml_route "$WRANGLER_TOML"

  cat <<EOF

Mostly destroyed.
  Worker:    deleted
  Database:  deleted
  State:     removed

wrangler.toml has been reset to the committed baseline.
EOF
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bats scripts/__tests__/deploy-cloudflare.bats`
Expected: All tests PASS.

- [ ] **Step 5: Run shellcheck**

Run: `shellcheck scripts/deploy-cloudflare.sh`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy-cloudflare.sh scripts/__tests__/deploy-cloudflare.bats
git commit -m "feat(deploy): destroy subcommand with double-confirmation"
```

---

## Phase 4: Integration and finishing

---

### Task 13: Add deploy-script CI job

**Files:**
- Modify: `.github/workflows/e2e.yml`

Add a new CI job that runs `shellcheck` and `bats` on the script and tests. No Cloudflare credentials required because the tests use stubs.

- [ ] **Step 1: Read the current workflow**

Run: `cat .github/workflows/e2e.yml`

- [ ] **Step 2: Add the deploy-script job**

Append a new job to `.github/workflows/e2e.yml` (after `e2e-docker`, before end-of-file):

```yaml
  deploy-script:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install bats-core and shellcheck
        run: |
          sudo apt-get update
          sudo apt-get install -y bats shellcheck
      - name: shellcheck the deploy script and helpers
        run: |
          shellcheck scripts/deploy-cloudflare.sh \
                     scripts/lib/deploy-cloudflare-utils.sh \
                     scripts/stubs/*
      - name: Run bats tests
        run: bats scripts/__tests__/
```

- [ ] **Step 3: Verify the workflow YAML is valid**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/e2e.yml'))" && echo "valid yaml"`
Expected: `valid yaml`. If python3 isn't available, use `pnpm dlx js-yaml .github/workflows/e2e.yml` or skip this step and trust CI to catch a typo.

- [ ] **Step 4: Run shellcheck + bats one more time locally to make sure the committed state matches what CI will run**

Run:
```bash
shellcheck scripts/deploy-cloudflare.sh scripts/lib/deploy-cloudflare-utils.sh scripts/stubs/*
bats scripts/__tests__/
```
Expected: No shellcheck errors. All bats tests pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci: run shellcheck and bats for the Cloudflare deploy script"
```

---

### Task 14: Rewrite `docs/cloudflare-deployment.md`

**Files:**
- Modify: `docs/cloudflare-deployment.md`

Lead with the script. Keep the manual walkthrough as an appendix so users who can't run the script still have a reference.

- [ ] **Step 1: Read the current document**

Run: `cat docs/cloudflare-deployment.md`

- [ ] **Step 2: Rewrite the file**

Overwrite `docs/cloudflare-deployment.md` with the full content below. (This is the whole file — do not append or patch.)

```markdown
# Deploying Mostly to Cloudflare Workers + D1

Mostly runs on Cloudflare as a single Worker that serves both the `/v0/*`
API and the React frontend via Workers Static Assets. One deployment,
one URL, one DNS entry.

The fastest path is the provisioning script at
`scripts/deploy-cloudflare.sh`. It handles fresh installs and updates,
and the manual recipe below is available as a fallback.

> **Note:** D1 does not support multi-statement transactions
> (BEGIN/COMMIT/ROLLBACK). Multi-step write operations (e.g., task
> creation with key allocation) use sequential statements rather than
> atomic transactions. D1's single-writer guarantee prevents concurrent
> conflicts. Mid-operation failures can leave partial state; for most
> workloads this is fine.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI
  (`npm install -g wrangler`)
- `curl`, `jq`, `openssl` on PATH (standard on Linux and macOS)

Authenticate with Cloudflare once:

    wrangler login

## Fresh install

Clone the repo, install dependencies, and run the provisioner:

    git clone <repo-url>
    cd mostlylinear
    pnpm install
    ./scripts/deploy-cloudflare.sh init

The script will:

1. Verify your tools and Cloudflare login
2. Prompt for an admin handle and password (unless you pass
   `--admin-handle` / `--admin-password`)
3. Create the `mostly-db` D1 database
4. Apply migrations
5. Seed the default workspace
6. Build the web package (with `VITE_SINGLE_ORIGIN=true` so the frontend
   uses the current origin for the API)
7. Build and deploy the worker
8. Register the first admin via `POST /v0/auth/register`
9. Mint a personal API key (`msk_*`)
10. Install a workspace agent token (`mat_*`) by writing its SHA-256 hash
    to `workspace.agent_token_hash`
11. Save non-secret state to `.cloudflare.env` (gitignored)
12. Print a summary with the URL, API key, and agent token — **save
    both tokens, they are only shown once**

When it finishes you'll see:

    Mostly deployed successfully.

    URL:          https://mostly.<your-subdomain>.workers.dev
    Admin:        admin
    API key:      msk_...                   (save this — shown only once)
    Agent token:  mat_...                   (save this — shown only once)

### Custom domain

Pass `--domain <host>` on init:

    ./scripts/deploy-cloudflare.sh init --domain mostly.example.com

The script writes a `route` block into `wrangler.toml` for you. The
domain must be on Cloudflare DNS; add the custom domain in the Cloudflare
dashboard under Workers & Pages → your worker → Settings → Triggers →
Custom Domains if you haven't already.

### Non-interactive install

For CI or automated runs, pass all the inputs via flags:

    ./scripts/deploy-cloudflare.sh init \
      --admin-handle admin \
      --admin-password "$MOSTLY_ADMIN_PASSWORD" \
      --workspace-slug acme \
      --domain mostly.acme.com

## Updates

To push new code to an existing deployment:

    ./scripts/deploy-cloudflare.sh update

This applies any new D1 migrations, rebuilds the web and worker
packages, and redeploys. It does not touch users, API keys, the agent
token, or the workspace row. Running it twice in a row is a no-op.

If you ran `git checkout wrangler.toml` between deploys and cleared the
provisioned `database_id` / `WORKSPACE_ID`, `update` reads
`.cloudflare.env` and restores them before redeploying.

## Teardown

To wipe everything:

    ./scripts/deploy-cloudflare.sh destroy --yes-i-really-mean-it

The script prints what will be deleted and then asks you to retype the
worker name to confirm. After double-confirmation it deletes the worker,
deletes the D1 database, removes `.cloudflare.env`, and resets the
`database_id` / `WORKSPACE_ID` placeholders in `wrangler.toml` back to
empty strings. `git diff wrangler.toml` will be empty after a successful
teardown.

**This is irreversible.** All users, tasks, and API keys are lost.

## Configure the CLI and MCP client

Point `~/.mostly/config` at the deployed URL:

```json
{
  "server_url": "https://mostly.<your-subdomain>.workers.dev",
  "api_key": "msk_<your-api-key>"
}
```

If you want headless jobs to run under the shared agent token in
addition to (or instead of) a personal API key:

```json
{
  "server_url": "https://mostly.<your-subdomain>.workers.dev",
  "api_key": "msk_...",
  "agent_token": "mat_...",
  "default_actor": "admin"
}
```

When both are set, `api_key` wins. `agent_token` is only consulted when
`api_key` is missing, and it requires `default_actor` so the server
knows which agent principal to record.

Then run `mostly-mcp` or the `mostly` CLI as usual.

## Local development

To test Workers locally before deploying:

    wrangler dev

This starts a local Workers runtime with D1 backed by a local SQLite
file. Apply migrations locally first:

    wrangler d1 migrations apply mostly-db --local

Local dev still shows the `SetupScreen` prompt for a server URL because
`VITE_SINGLE_ORIGIN` is not set when you run `pnpm --filter @mostly/web
dev` — that's intended; local dev typically has the API and frontend on
different ports.

## Troubleshooting

**"D1_ERROR: no such table"**
Migrations haven't been applied. Run
`wrangler d1 migrations apply mostly-db --remote`.

**401 Unauthorized**
Your credentials didn't resolve to a principal. Check that the
`Authorization: Bearer msk_...` header is present and spelled correctly,
and — if you're using an agent token — that the request body includes
`actor_handle` on mutating requests. If the CLI is returning 401 on
*every* command (including `mostly api-key list`), the persisted API key
is likely stale or revoked; recover by signing in again with
`mostly login` or by minting a new key from the web UI's API Keys page.

**403 Forbidden**
`POST /v0/auth/register` returns 403 with `code: "forbidden"` once a
human principal exists and `workspace.allow_registration` is false.
That's the intended locked-down state after the first admin registers —
use `mostly invite <handle>` from an authenticated admin (or the web
Invite User flow) to add subsequent users.

**500 Internal Server Error**
Check worker logs: `wrangler tail`.

**"WORKSPACE_ID is empty"**
Set `WORKSPACE_ID` in `wrangler.toml` `[vars]` section, or re-run
`./scripts/deploy-cloudflare.sh update` to reconcile it from
`.cloudflare.env`.

## Appendix: Manual provisioning

This is the step-by-step recipe that `scripts/deploy-cloudflare.sh init`
automates. It exists as a reference for people who want to understand
what the script does, or who need to fix a partially-provisioned
deployment where the script can't help.

### 1. Create a D1 Database

    wrangler d1 create mostly-db

Copy the printed `database_id`.

### 2. Configure wrangler.toml

Open `wrangler.toml` at the project root and set:

```toml
[[d1_databases]]
binding = "DB"
database_name = "mostly-db"
database_id = "<paste-your-database-id-here>"

[vars]
WORKSPACE_ID = "01WORKSPACE000000000000001"

[assets]
directory = "packages/web/dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/v0/*"]
```

### 3. Apply migrations

    wrangler d1 migrations apply mostly-db --remote

### 4. Seed the workspace

    wrangler d1 execute mostly-db --remote --command \
      "INSERT INTO workspace (id, slug, name, created_at, updated_at) VALUES ('01WORKSPACE000000000000001', 'default', 'Default Workspace', datetime('now'), datetime('now'));"

Do **not** pre-create a principal by hand. The first-user registration
flow (step 7 below) does that for you after the Worker is deployed, and
it sets a bcrypt password hash that you cannot easily produce from raw
SQL.

### 5. Build the web and worker packages

    VITE_SINGLE_ORIGIN=true pnpm --filter @mostly/web build
    pnpm --filter @mostly/server build:worker

### 6. Deploy

    wrangler deploy

Wrangler prints the deployed URL (e.g.
`https://mostly.<your-subdomain>.workers.dev`).

### 7. Register the first user

The Worker is now live but has no users. Because no principals exist,
`POST /v0/auth/register` is open and the first caller becomes the admin:

    curl -X POST https://mostly.<your-subdomain>.workers.dev/v0/auth/register \
      -H "Content-Type: application/json" \
      -d '{"handle": "admin", "password": "<pick-something-strong>", "display_name": "Admin"}'

After this, `/v0/auth/register` is locked down to invite-only.

### 8. Create a personal API key

    # Log in — stores the session cookie in a file for the next call.
    curl -c cookies.txt -X POST https://mostly.<your-subdomain>.workers.dev/v0/auth/login \
      -H "Content-Type: application/json" \
      -d '{"handle": "admin", "password": "<your-password>"}'

    # Create an API key using the session cookie.
    curl -b cookies.txt -X POST https://mostly.<your-subdomain>.workers.dev/v0/auth/api-keys \
      -H "Content-Type: application/json" \
      -d '{"name": "admin-cli"}'

The response includes a `key` field beginning with `msk_` — save it now,
it is only shown once.

### 9. (Optional) Install a workspace agent token

    TOKEN="mat_$(openssl rand -hex 32)"
    HASH=$(printf %s "$TOKEN" | openssl dgst -sha256 -hex | awk '{print $2}')
    wrangler d1 execute mostly-db --remote \
      --command "UPDATE workspace SET agent_token_hash = '$HASH', updated_at = datetime('now') WHERE id = '01WORKSPACE000000000000001';"
    echo "Agent token (save this — it is the only copy): $TOKEN"

Agents authenticate with this token in a `Bearer` header and include
`actor_handle` on every mutating request body.

### 10. Verify

Test the deployment with the API key from step 8:

    curl -H "Authorization: Bearer msk_<your-api-key>" https://mostly.<your-subdomain>.workers.dev/v0/principals

You should see a JSON response listing the admin principal.
```

- [ ] **Step 3: Commit**

```bash
git add docs/cloudflare-deployment.md
git commit -m "docs: rewrite Cloudflare deployment guide around the provisioner script"
```

---

### Task 15: README update and smoke-test checklist

**Files:**
- Modify: `README.md`
- Create: `scripts/smoke-test-cloudflare.md`

- [ ] **Step 1: Read the README to find the deployment section**

Run: `grep -n -i "cloudflare\|deploy" README.md`

- [ ] **Step 2: Update the README deployment section**

In `README.md`, find the Cloudflare section and add a note about the script. The exact change depends on what's there — aim for one or two lines pointing at the provisioner. If there is no existing deployment section, add one near the bottom (before any "License" section):

```markdown
## Deploying to Cloudflare

For a fresh install or to push updates, run:

    ./scripts/deploy-cloudflare.sh init      # first time
    ./scripts/deploy-cloudflare.sh update    # subsequent deploys

See [`docs/cloudflare-deployment.md`](docs/cloudflare-deployment.md) for
details, custom domain setup, and manual provisioning instructions.
```

If the existing section already covers deployment, replace its body with
the same content above (keep the section heading). Do not leave both the
old manual walkthrough and the new script pointer in the README — the
manual walkthrough lives in `docs/cloudflare-deployment.md` now.

- [ ] **Step 3: Create the smoke-test checklist**

Create `scripts/smoke-test-cloudflare.md`:

```markdown
# Cloudflare Provisioner Smoke Test

Manual pre-release checklist for `scripts/deploy-cloudflare.sh`. Run
against a throwaway Cloudflare account (or a personal test account) so
you can freely destroy the deployment afterward.

## Prerequisites

- `wrangler login` completed on the test account
- Clean checkout of the branch to test
- No `.cloudflare.env` file in the repo root

## 1. Fresh init

```bash
./scripts/deploy-cloudflare.sh init \
  --admin-handle smoke \
  --admin-password "$(openssl rand -base64 24)"
```

Verify:

- [ ] Script prints `Mostly deployed successfully.` at the end
- [ ] URL printed matches `https://mostly.*.workers.dev`
- [ ] API key printed starts with `msk_`
- [ ] Agent token printed starts with `mat_`
- [ ] `.cloudflare.env` was created and contains `DATABASE_ID=`,
      `WORKSPACE_ID=`, `WORKER_URL=`
- [ ] Opening the URL in a browser shows the Mostly web UI (not the
      SetupScreen) — the single-origin build flag is working
- [ ] `curl -H "Authorization: Bearer <msk_key>" <url>/v0/principals`
      returns JSON with the admin principal
- [ ] `wrangler tail` during the curl call shows the API request hitting
      the worker

## 2. Update

Make a trivial code change (e.g., touch a comment in `packages/server/src/app.ts`),
then:

```bash
./scripts/deploy-cloudflare.sh update
```

Verify:

- [ ] Script prints `Mostly updated.` at the end
- [ ] Output does NOT include any `register` or `api-keys` calls
- [ ] `.cloudflare.env` is unchanged (`git status` on a fresh clone
      would show it the same as after `init`)
- [ ] Opening the URL still shows the web UI, and the admin can still
      log in with the same API key
- [ ] Re-running `./scripts/deploy-cloudflare.sh update` a second time
      in a row prints the same success output (idempotent)

## 3. Destroy

```bash
./scripts/deploy-cloudflare.sh destroy --yes-i-really-mean-it
```

Enter `mostly` at the confirmation prompt.

Verify:

- [ ] Script prints `Mostly destroyed.` at the end
- [ ] `.cloudflare.env` no longer exists
- [ ] `git diff wrangler.toml` is empty (placeholders reset)
- [ ] The deployed URL returns `Worker not found` or similar
- [ ] `wrangler d1 list` no longer contains `mostly-db`

## 4. Negative tests

- [ ] Run `init` while `.cloudflare.env` exists → exits 1 with
      "already initialized"
- [ ] Run `update` while `.cloudflare.env` is missing → exits 1 with
      "not initialized"
- [ ] Run `destroy` without `--yes-i-really-mean-it` → exits 1 with a
      "re-run with" message
- [ ] Run `destroy --yes-i-really-mean-it` and type the wrong worker
      name → exits 0 with "aborted." and state is untouched
```

- [ ] **Step 4: Commit**

```bash
git add README.md scripts/smoke-test-cloudflare.md
git commit -m "docs: README pointer to deploy script and smoke-test checklist"
```

---

### Task 16: Mark spec as implemented, final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-04-07-cloudflare-provisioner-design.md`

Flip the spec status, run the whole test suite one more time, and produce a final green baseline.

- [ ] **Step 1: Verify everything is green**

Run:
```bash
pnpm install
pnpm build
pnpm -r --if-present test
pnpm test:e2e
shellcheck scripts/deploy-cloudflare.sh scripts/lib/deploy-cloudflare-utils.sh scripts/stubs/*
bats scripts/__tests__/
```
Expected: All commands exit 0. Every test suite passes.

- [ ] **Step 2: Update the spec status**

In `docs/superpowers/specs/2026-04-07-cloudflare-provisioner-design.md`, find:

```markdown
**Status:** Approved
```

and change it to (use today's date):

```markdown
**Status:** Implemented (YYYY-MM-DD)
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-04-07-cloudflare-provisioner-design.md
git commit -m "docs: mark Cloudflare provisioner spec as implemented"
```

- [ ] **Step 4: Final sanity pass**

Run: `git log --oneline feature/cloudflare-provisioner ^main`
Expected: 16 commits (one per task), each with a meaningful message. If any commit is empty, malformed, or bundles multiple tasks, address it before opening a PR.

Run: `git status`
Expected: clean working tree.

The implementation is done. The next step is whatever your normal
"finishing a development branch" flow looks like: open a PR, wait for
CI, review, merge. That is intentionally out of scope for this plan.
