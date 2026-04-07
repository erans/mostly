# Deploying Mostly to Cloudflare Workers + D1

This guide walks through deploying the Mostly task tracker API to Cloudflare Workers with D1 as the database backend.

> **Note:** D1 does not support multi-statement transactions (BEGIN/COMMIT/ROLLBACK). Multi-step write operations (e.g., task creation with key allocation) use sequential statements rather than atomic transactions. D1's single-writer guarantee prevents concurrent conflicts, and key operations like `nextKeyNumber` use single atomic SQL statements. For most workloads this is fine, but be aware that a mid-operation failure could leave partial state.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI

Install wrangler:

    npm install -g wrangler

Authenticate:

    wrangler login

## 1. Clone and Build

    git clone <repo-url>
    cd mostlylinear
    pnpm install
    pnpm build

## 2. Create a D1 Database

    wrangler d1 create mostly-db

This prints a `database_id`. Copy it.

## 3. Configure wrangler.toml

Open `wrangler.toml` at the project root and set the `database_id`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "mostly-db"
database_id = "<paste-your-database-id-here>"
```

## 4. Apply Migrations

Apply the database schema to your D1 instance:

    wrangler d1 migrations apply mostly-db --remote

This runs all SQL migrations from `packages/db/migrations/`.

## 5. Seed the Workspace

Create a default workspace (the first — and, until multi-tenancy lands, the only — workspace the Worker will serve):

    wrangler d1 execute mostly-db --remote --command "INSERT INTO workspace (id, slug, name, created_at, updated_at) VALUES ('01WORKSPACE000000000000001', 'default', 'Default Workspace', datetime('now'), datetime('now'));"

Copy the workspace ID (`01WORKSPACE000000000000001`) — you'll need it in step 6.

Do **not** pre-create a principal by hand. The first-user registration flow (step 9) will do that for you after the Worker is deployed, and it sets a bcrypt password hash the login endpoint can verify — something you cannot easily produce from raw SQL.

## 6. Set the Workspace ID

In `wrangler.toml`, set the workspace ID from step 5:

```toml
[vars]
WORKSPACE_ID = "01WORKSPACE000000000000001"
```

## 7. Build the Worker

Build the worker bundle:

    pnpm --filter @mostly/server build:worker

## 8. Deploy

    wrangler deploy

Wrangler prints the deployed URL, e.g., `https://mostly.<your-subdomain>.workers.dev`.

## 9. Register the First User

The Worker is now live but has no users. Because no principals exist, `POST /v0/auth/register` is open and the first caller becomes the admin. Pick a strong password:

    curl -X POST https://mostly.<your-subdomain>.workers.dev/v0/auth/register \
      -H "Content-Type: application/json" \
      -d '{"handle": "admin", "password": "<pick-something-strong>", "display_name": "Admin"}'

The response sets a session cookie and returns the admin principal. After this point `/v0/auth/register` is locked down to invite-only (unless `workspace.allow_registration` is true).

## 10. Create a Personal API Key

With the admin session cookie from step 9 (or by logging in fresh via `POST /v0/auth/login`), mint a long-lived API key for CLI and HTTP use:

    # Log in — stores the session cookie in a file for the next call.
    curl -c cookies.txt -X POST https://mostly.<your-subdomain>.workers.dev/v0/auth/login \
      -H "Content-Type: application/json" \
      -d '{"handle": "admin", "password": "<your-password>"}'

    # Create an API key using the session cookie.
    curl -b cookies.txt -X POST https://mostly.<your-subdomain>.workers.dev/v0/auth/api-keys \
      -H "Content-Type: application/json" \
      -d '{"name": "admin-cli"}'

The response includes a `key` field beginning with `msk_` — **save it now**, it is only shown once.

## 11. (Optional) Install a Workspace Agent Token

If you want agents or CI jobs to authenticate without impersonating a user, seed a shared agent token. The Worker entrypoint does not implement the `MOSTLY_BOOTSTRAP_AGENT_TOKEN` env var that the local node server does, so the cleanest path is to generate a token, hash it, and set `workspace.agent_token_hash` directly:

    TOKEN="mat_$(openssl rand -hex 32)"
    HASH=$(printf %s "$TOKEN" | openssl dgst -sha256 -hex | awk '{print $2}')
    wrangler d1 execute mostly-db --remote \
      --command "UPDATE workspace SET agent_token_hash = '$HASH', updated_at = datetime('now') WHERE id = '01WORKSPACE000000000000001';"
    echo "Agent token (save this — it is the only copy): $TOKEN"

Agents authenticate by sending this token as a `Bearer` header and including `actor_handle` in every mutating request body.

## 12. Verify

Test the deployment with the API key from step 10:

    curl -H "Authorization: Bearer msk_<your-api-key>" https://mostly.<your-subdomain>.workers.dev/v0/principals

You should see a JSON response listing the admin principal.

## 13. Configure CLI and MCP Clients

Point the CLI and MCP server at the deployed API by editing `~/.mostly/config`:

```json
{
  "server_url": "https://mostly.<your-subdomain>.workers.dev",
  "api_key": "msk_<your-api-key-from-step-10>"
}
```

This is the minimum config for a human user — the CLI and MCP client both use `api_key` when present, and the server resolves your identity from the key. If you also installed an agent token in step 11 and want to run headless jobs without a user account, add `agent_token` and `default_actor` instead (or alongside):

```json
{
  "server_url": "https://mostly.<your-subdomain>.workers.dev",
  "api_key": "msk_...",
  "agent_token": "mat_...",
  "default_actor": "admin"
}
```

When both are set, `api_key` wins (humans should authenticate as themselves). `agent_token` is only used when `api_key` is missing, and it requires `default_actor` so the server knows which agent principal to record.

Then run `mostly-mcp` as usual — it will connect to the Cloudflare-hosted API.

## Local Development

To test Workers locally before deploying:

    wrangler dev

This starts a local Workers runtime with D1 backed by a local SQLite file. Apply migrations locally first:

    wrangler d1 migrations apply mostly-db --local

## Custom Domain

To use a custom domain instead of `*.workers.dev`:

1. Go to Cloudflare dashboard > Workers & Pages > your worker
2. Click "Settings" > "Triggers" > "Custom Domains"
3. Add your domain (must be on Cloudflare DNS)

## Troubleshooting

**"D1_ERROR: no such table"**
Migrations haven't been applied. Run `wrangler d1 migrations apply mostly-db --remote`.

**401 Unauthorized**
Your credentials didn't resolve to a principal. Check that the `Authorization: Bearer msk_...` header is present and spelled correctly, and — if you're using an agent token — that the request body includes `actor_handle` on mutating requests. If the CLI is returning 401 on *every* command (including `mostly api-key list`), the persisted API key is likely stale or revoked; recover by signing in again with `mostly login` or by minting a new key from the web UI's API Keys page.

**403 Forbidden**
`POST /v0/auth/register` returns 403 with `code: "forbidden"` once a human principal exists and `workspace.allow_registration` is false. That's the intended locked-down state after the first admin registers — use `mostly invite <handle>` from an authenticated admin (or the web Invite User flow) to add subsequent users.

**500 Internal Server Error**
Check worker logs: `wrangler tail`.

**"WORKSPACE_ID is empty"**
Set `WORKSPACE_ID` in `wrangler.toml` `[vars]` section.
