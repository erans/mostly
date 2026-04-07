# Cloudflare Provisioner — Design Spec

**Date:** 2026-04-07
**Status:** Approved

## Purpose

Replace the 13-step manual Cloudflare deployment walkthrough in
`docs/cloudflare-deployment.md` with a single bash script that takes a fresh
clone from zero to a working Mostly deployment, and that can push new code to
an existing deployment without touching users, tokens, or data. Cover both
install and update lifecycles in one place so the happy path is one command.

The script deploys Mostly as a **single Cloudflare Worker** that serves both
the `/v0/*` API and the React frontend (via Workers Static Assets). One URL,
one DNS entry, one deployment pipeline.

## Non-Goals

- Multi-tenant / multi-workspace deployments. The script seeds a single fixed
  workspace ID, matching current single-tenant reality.
- Zero-downtime migrations. D1 migrations apply as-is; for anything destructive
  the author is expected to know what they're doing.
- Cloudflare Pages deployment. We commit to Workers Static Assets.
- Non-Cloudflare targets. Fly.io, AWS, etc. are out of scope; a local Docker
  test target already exists separately.
- Automatic rollback. Cloudflare operations are not transactional; a broken
  rollback is worse than a clear error message with next-action guidance.

## Success Criteria

1. A fresh clone on a machine with `wrangler`, `pnpm`, `jq`, `curl`, `openssl`
   installed and `wrangler login` completed can run
   `./scripts/deploy-cloudflare.sh init` and land on a fully working deployment
   (API reachable, frontend reachable, admin account created, API key + agent
   token printed).
2. `./scripts/deploy-cloudflare.sh update` pushes new code to the existing
   deployment in one command without re-running anything user-facing (no
   prompts, no bootstrap curl calls). Running it twice in a row is a no-op.
3. `./scripts/deploy-cloudflare.sh destroy --yes-i-really-mean-it` cleanly
   removes the worker, the D1 database, and the local state file, and resets
   `wrangler.toml` to its committed baseline.
4. `shellcheck scripts/deploy-cloudflare.sh` passes.
5. Shellspec unit tests pass in CI without a Cloudflare account.
6. `docs/cloudflare-deployment.md` leads with the script; the manual
   walkthrough remains available as an appendix.

## Architecture Overview

```
scripts/
  deploy-cloudflare.sh          # main entry
  lib/
    deploy-cloudflare-utils.sh  # shared helpers (sourced by main)
  __tests__/
    deploy-cloudflare.spec.sh   # shellspec tests
  stubs/                        # fake wrangler/curl for tests
    wrangler
    curl

.cloudflare.env                 # gitignored state file, written by init
```

The script is one file (the entry point) plus a sourced helpers file so that
the entry point stays readable and the helpers are individually unit-testable.

## Component Design

### 1. Repo pre-work (code changes, not the script)

The script is only useful if the repo is shaped for single-worker-serves-both.
Four small changes land before the script:

**`wrangler.toml`** — add an `[assets]` block and tell wrangler to run the
worker first for API paths:

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

`run_worker_first = ["/v0/*"]` routes API requests through the worker;
everything else goes straight to static assets. `not_found_handling =
"single-page-application"` returns `index.html` for unknown paths so React
Router's client-side routes work on refresh.

**`packages/server/src/worker.ts`** — add `ASSETS` to the `Env` interface and
a fall-through safety net: if the Hono app returns 404 for a non-API path,
defer to static assets. The `run_worker_first` glob is the primary router;
this is belt-and-suspenders.

```typescript
interface Env {
  DB: unknown;
  WORKSPACE_ID: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// After app.fetch(request, env) returns:
if (response.status === 404 && !new URL(request.url).pathname.startsWith('/v0/')) {
  return env.ASSETS.fetch(request);
}
return response;
```

**`packages/web`** — skip `SetupScreen` when served from the same origin as
the API. The web app already has a `setBaseUrl` plumbing; this adds a build-
time opt-in:

- `App.tsx` (or `use-config.ts`): detect
  `import.meta.env.VITE_SINGLE_ORIGIN === 'true'`. When true, synthesize a
  config with `serverUrl: window.location.origin`, skip `SetupScreen`, and
  do not persist anything to localStorage. When false or unset (dev,
  multi-origin), the existing flow is unchanged.
- No `vite.config.ts` changes needed — Vite reads `VITE_*` env vars
  automatically.

**`.gitignore`** — add one line:

```
.cloudflare.env
```

### 2. State file (`.cloudflare.env`)

A bash-source-able `KEY=value` file at the repo root, gitignored. Written by
`init`, read by `update` and `destroy`, removed by `destroy`.

Contents:

```
DATABASE_ID=<id returned by wrangler d1 create>
DATABASE_NAME=mostly-db
WORKSPACE_ID=01WORKSPACE000000000000001
WORKSPACE_SLUG=default
WORKER_NAME=mostly
WORKER_URL=https://mostly.<account>.workers.dev
ADMIN_HANDLE=admin
DOMAIN=
```

`ADMIN_HANDLE` is stored for reference only (so the user can look up who the
first admin was). **No secrets are persisted to disk.** `msk_*` and `mat_*`
values are printed once at `init` and the user is responsible for saving
them.

### 3. The script — subcommands and flags

**Entry point**: `scripts/deploy-cloudflare.sh <subcommand> [flags]`

**Subcommands**: `init`, `update`, `destroy`.

**`init` flags**:
- `--domain <host>` — install with a custom domain (added to `wrangler.toml`
  as a route block). If omitted, uses the default `*.workers.dev` URL.
- `--admin-handle <handle>` — admin user handle. If omitted, prompt.
- `--admin-password <password>` — admin password. If omitted, prompt via
  `read -s`, asked twice for confirmation.
- `--workspace-slug <slug>` — defaults to `default`.
- `--dry-run` — print every external command that would be executed,
  prefixed with `would-run:`, without running any of them. State file writes
  become no-ops.

**`update` flags**:
- `--dry-run` — same semantics as init.

**`destroy` flags**:
- `--yes-i-really-mean-it` — required. Without it, the script prints what
  would be destroyed and exits non-zero.

### 4. `init` flow

Preflight checks (fail fast, no mutations):

1. Confirm we're in the repo root (`wrangler.toml`, `packages/server`,
   `packages/web` all present).
2. Confirm `wrangler`, `pnpm`, `curl`, `openssl`, `jq` are on PATH.
3. Confirm `wrangler whoami` returns a logged-in account.
4. Confirm `.cloudflare.env` does **not** exist. If it does, refuse with
   "already initialized — use `update` or `destroy`."
5. Parse flags.
6. Validate `--workspace-slug` (if provided) against `^[a-z][a-z0-9-]{0,62}$`.
   Reject anything else with a clear error. This keeps the slug safe for
   interpolation into the `wrangler d1 execute` SQL at step 13 and matches
   what a workspace slug realistically looks like.
7. Validate `--admin-handle` against `^[a-z][a-z0-9-]{0,62}$` for the same
   reason — it ends up in the JSON body of the register call and also in
   `.cloudflare.env` as `ADMIN_HANDLE`.
8. If `--admin-handle` / `--admin-password` are missing, prompt for each.
   Password is read via `read -s` and asked twice for confirmation.

Provision infrastructure:

9. `wrangler d1 create mostly-db --json` → parse `database_id` with `jq`.
10. Patch `wrangler.toml`: set `database_id = "<id>"`.
11. `wrangler d1 migrations apply mostly-db --remote`.
12. `WORKSPACE_ID` = `01WORKSPACE000000000000001` (fixed value, matches
    existing docs).
13. Seed the workspace row:
    ```bash
    wrangler d1 execute mostly-db --remote --command \
      "INSERT OR IGNORE INTO workspace (id, slug, name, created_at, updated_at)
       VALUES ('01WORKSPACE000000000000001', '$WORKSPACE_SLUG',
               'Default Workspace', datetime('now'), datetime('now'));"
    ```
    `OR IGNORE` makes this retry-safe.
14. Patch `wrangler.toml`: set `WORKSPACE_ID = "01WORKSPACE000000000000001"`.

Build and deploy:

15. If `--domain` was passed, add to `wrangler.toml`:
    ```toml
    route = { pattern = "<domain>/*", custom_domain = true }
    ```
16. `VITE_SINGLE_ORIGIN=true pnpm --filter @mostly/web build` →
    `packages/web/dist`.
17. `pnpm --filter @mostly/server build:worker` →
    `packages/server/dist/worker.js`.
18. `wrangler deploy` → parse the deployed URL from stdout.

Bootstrap first admin + credentials:

19. Register the first admin:
    ```bash
    curl -sS -c /tmp/mostly-cookies.$$ -X POST "$WORKER_URL/v0/auth/register" \
      -H 'Content-Type: application/json' \
      -d "{\"handle\":\"$ADMIN_HANDLE\",\"password\":\"$ADMIN_PASSWORD\",\"display_name\":\"$ADMIN_HANDLE\"}"
    ```
    The register endpoint is open at this point because no principals exist
    yet. The response sets a session cookie.
20. Mint an API key using the session cookie:
    ```bash
    curl -sS -b /tmp/mostly-cookies.$$ -X POST "$WORKER_URL/v0/auth/api-keys" \
      -H 'Content-Type: application/json' \
      -d '{"name":"admin-cli"}'
    ```
    Extract the `msk_*` value with `jq`.
21. Generate and install an agent token:
    ```bash
    AGENT_TOKEN="mat_$(openssl rand -hex 32)"
    AGENT_HASH=$(printf %s "$AGENT_TOKEN" | openssl dgst -sha256 -hex | awk '{print $2}')
    wrangler d1 execute mostly-db --remote --command \
      "UPDATE workspace SET agent_token_hash = '$AGENT_HASH',
       updated_at = datetime('now') WHERE id = '$WORKSPACE_ID';"
    ```
22. Remove `/tmp/mostly-cookies.$$` (trap on exit to guarantee).

Persist state and report:

23. Write `.cloudflare.env` with `DATABASE_ID`, `DATABASE_NAME`,
    `WORKSPACE_ID`, `WORKSPACE_SLUG`, `WORKER_NAME`, `WORKER_URL`,
    `ADMIN_HANDLE`, `DOMAIN`.
24. Print a summary:
    ```
    Mostly deployed successfully.

    URL:          https://mostly.abc123.workers.dev
    Admin:        admin
    API key:      msk_...                   (save this — shown only once)
    Agent token:  mat_...                   (save this — shown only once)

    Configure your CLI:
      mostly config set server_url https://mostly.abc123.workers.dev
      mostly config set api_key msk_...

    State saved to .cloudflare.env (gitignored).
    ```

### 5. `update` flow

Preflight:

1. Confirm repo root and required tools on PATH.
2. Confirm `wrangler whoami` is logged in.
3. Confirm `.cloudflare.env` **exists**. If not: "not initialized — run
   `init` first."
4. Parse flags (`--dry-run`).
5. `source .cloudflare.env` → import `DATABASE_ID`, `DATABASE_NAME`,
   `WORKSPACE_ID`, `WORKER_NAME`, `WORKER_URL`, `DOMAIN`.

Reconcile `wrangler.toml`:

6. Rewrite `database_id`, `WORKSPACE_ID`, and (if `DOMAIN` is non-empty) the
   route block in `wrangler.toml` from the state file. If the user ran
   `git checkout wrangler.toml` between deploys, this restores the deployed
   config. If not, it's a no-op.

Apply, build, deploy:

7. `wrangler d1 migrations apply mostly-db --remote` — idempotent.
8. `VITE_SINGLE_ORIGIN=true pnpm --filter @mostly/web build`.
9. `pnpm --filter @mostly/server build:worker`.
10. `wrangler deploy` → parse deployed URL.
11. If the parsed URL differs from `WORKER_URL`, warn and update
    `.cloudflare.env`.

Report:

12. Print a short summary (URL, migrations status, worker status).

`update` does not touch users, sessions, API keys, `agent_token_hash`, or
workspace row contents. It never prompts.

### 6. `destroy` flow

Preflight:

1. Confirm repo root, tools on PATH, `wrangler whoami`.
2. Confirm `.cloudflare.env` exists.
3. If `--yes-i-really-mean-it` is missing:
    ```
    destroy is destructive. To proceed, re-run with --yes-i-really-mean-it.

    This will permanently delete:
      - Worker:    mostly
      - Database:  mostly-db (<database-id>)
      - State:     .cloudflare.env

    Users, tasks, and API keys will be permanently lost.
    ```
   Exit 1.

Second confirmation (interactive, even with `--yes-i-really-mean-it`):

4. Print the "this will delete..." block.
5. Prompt `Type the worker name (mostly) to confirm: `. Compare exactly. Any
   mismatch → "aborted." exit 0.

Teardown:

6. `wrangler delete` (reads name from `wrangler.toml`).
7. `wrangler d1 delete mostly-db --skip-confirmation`.
8. `rm .cloudflare.env`.
9. Reset `wrangler.toml`:
   - `database_id = "<id>"` → `database_id = ""`
   - `WORKSPACE_ID = "..."` → `WORKSPACE_ID = ""`
   - If a `route = ...` block was added, remove it.
   The result: `git diff wrangler.toml` is empty.
10. Print a summary.

Failure handling inside destroy:

- If `wrangler delete` reports "worker not found," log "worker already gone"
  and continue to D1.
- If `wrangler d1 delete` fails, abort and leave `.cloudflare.env` in place.
  Do not remove state until both Cloudflare resources are confirmed deleted.

### 7. Error handling

- `set -euo pipefail` at the top. `IFS=$'\n\t'` to defang word splitting.
- `trap 'on_error $LINENO' ERR` prints a contextual error using a
  `CURRENT_STEP` variable updated by a `log_step` helper.
- Each subcommand is a function (`cmd_init`, `cmd_update`, `cmd_destroy`)
  dispatched from a top-level argument parser.
- Shared helpers in `scripts/lib/deploy-cloudflare-utils.sh`:
  `require_cmd`, `require_file`, `log_step`, `log_warn`, `die`, `read_state`,
  `write_state`, `patch_wrangler_toml`, `parse_deploy_url`, `retry_once`.
- Error messages always include the next action: `init` → "re-run or delete
  D1 by hand"; `update` → "fix and re-run"; `destroy` → "fix and re-run."
- HTTP failures in the auth bootstrap curl calls (steps 19–20 of `init`)
  retry once with a 2-second delay via `retry_once`. A failure is any
  non-2xx HTTP status or a connection error; after two attempts, fail with
  a clear message pointing at the deployed URL and suggesting the user
  check `wrangler tail`. The agent-token install (step 21) is a `wrangler
  d1 execute` call, not HTTP, and is not retried — if D1 is down after
  a successful worker deploy, something is seriously wrong and retrying
  won't help.

### 8. Testing strategy

Three levels, cheapest first:

**Level 1: shellcheck.** Add `shellcheck scripts/deploy-cloudflare.sh
scripts/lib/deploy-cloudflare-utils.sh` to CI as a new step. Catches quoting
bugs, unquoted expansions, common bash footguns. Zero-cost.

**Level 2: `--dry-run` mode.** Every subcommand accepts `--dry-run`. When
set, external commands print as `would-run: <cmd>` instead of executing.
State file writes become no-ops. Wrangler and curl responses are stubbed
with minimal canned data so downstream steps can still print a realistic
plan. A reviewer can read the exact sequence of actions without a Cloudflare
account.

**Level 3: shellspec unit tests** at `scripts/__tests__/deploy-cloudflare.spec.sh`:

- Arg parsing (valid + invalid flag combinations, missing required flags).
- State file read/write round-trip with every field populated.
- `patch_wrangler_toml` produces the expected diff for each transition:
  blank → filled (`init`), filled → different (`update`), filled → blank
  (`destroy`).
- Preflight failures produce the right exit codes and messages (missing
  `.cloudflare.env` on update, existing `.cloudflare.env` on init,
  missing wrangler login).
- Wrangler and curl are stubbed via PATH override (`scripts/stubs/wrangler`,
  `scripts/stubs/curl`) — each stub records its invocations and returns
  canned output.
- Not tested: real Cloudflare calls.

**Level 4: manual smoke test.** A documented checklist at
`scripts/smoke-test-cloudflare.md`: fresh init, verify API + frontend +
admin, run update with a trivial code change, verify redeploy, run destroy,
verify clean state. Run against a throwaway workers.dev account before each
release that touches the script.

CI adds one new job, `deploy-script`, that runs shellcheck + shellspec. No
Cloudflare credentials required.

## Data Flow

```
init:
  user ──► script ──► wrangler d1 create ──► database_id
                  ──► wrangler.toml (patch database_id + WORKSPACE_ID)
                  ──► wrangler d1 migrations apply
                  ──► wrangler d1 execute (seed workspace)
                  ──► pnpm build (web + worker)
                  ──► wrangler deploy ──► worker_url
                  ──► curl POST /v0/auth/register ──► session cookie
                  ──► curl POST /v0/auth/api-keys ──► msk_*
                  ──► wrangler d1 execute (install agent token hash)
                  ──► .cloudflare.env (persist non-secret state)
                  ──► stdout (URL, admin, msk_, mat_)

update:
  user ──► script ──► .cloudflare.env (read state)
                  ──► wrangler.toml (reconcile from state)
                  ──► wrangler d1 migrations apply
                  ──► pnpm build (web + worker)
                  ──► wrangler deploy
                  ──► stdout (short summary)

destroy:
  user ──► script ──► --yes-i-really-mean-it check
                  ──► .cloudflare.env (read state)
                  ──► interactive confirmation (type worker name)
                  ──► wrangler delete
                  ──► wrangler d1 delete
                  ──► rm .cloudflare.env
                  ──► wrangler.toml (reset to baseline)
                  ──► stdout (summary)
```

## Open Questions

None. All decisions resolved through clarifying Q&A:

- Single Worker + Static Assets (not Pages, not API-only).
- Bash script (not Node/TypeScript, not CLI subcommand).
- `.cloudflare.env` state file (not in-place `wrangler.toml` mutation, not
  flag-driven).
- Auto-register first admin with prompts (not print-and-run-yourself, not
  separate script).
- Always install agent token on fresh install.
- Optional `--domain` flag.
- `destroy` subcommand with double confirmation.
- Web auto-uses `window.location.origin` via `VITE_SINGLE_ORIGIN` build flag
  (not leave SetupScreen, not bake explicit URL).

## Documentation Impact

- **`docs/cloudflare-deployment.md`** — rewrite. Lead with
  `./scripts/deploy-cloudflare.sh init`. Move the existing 13-step manual
  walkthrough to an appendix labeled "Manual provisioning" as a reference.
- **`README.md`** — two-line update in the deployment section pointing at
  the script.
- **`scripts/smoke-test-cloudflare.md`** — new. The manual smoke test
  checklist referenced in the testing section.
