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
