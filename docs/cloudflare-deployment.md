# Deploying Mostly to Cloudflare Workers + D1

This guide walks through deploying the Mostly task tracker API to Cloudflare Workers with D1 as the database backend.

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

## 5. Seed the Database

Create a default workspace:

    wrangler d1 execute mostly-db --remote --command "INSERT INTO workspace (id, slug, name, created_at, updated_at) VALUES ('01WORKSPACE000000000000001', 'default', 'Default Workspace', datetime('now'), datetime('now'));"

Copy the workspace ID (`01WORKSPACE000000000000001`) — you'll need it in step 7.

Create your first principal (user or agent):

    wrangler d1 execute mostly-db --remote --command "INSERT INTO principal (id, workspace_id, handle, kind, display_name, is_active, created_at, updated_at) VALUES ('01PRINCIPAL000000000000001', '01WORKSPACE000000000000001', 'admin', 'human', 'Admin', 1, datetime('now'), datetime('now'));"

## 6. Set the Auth Token

Generate a token and set it as a secret:

    openssl rand -hex 32 | wrangler secret put MOSTLY_TOKEN

Save this token — you'll need it to authenticate API requests.

## 7. Set the Workspace ID

In `wrangler.toml`, set the workspace ID from step 5:

```toml
[vars]
WORKSPACE_ID = "01WORKSPACE000000000000001"
```

## 8. Build the Worker

Build the worker bundle:

    pnpm --filter @mostly/server build:worker

## 9. Deploy

    wrangler deploy

Wrangler prints the deployed URL, e.g., `https://mostly.<your-subdomain>.workers.dev`.

## 10. Verify

Test the deployment:

    curl -H "Authorization: Bearer <your-token>" https://mostly.<your-subdomain>.workers.dev/v0/principals

You should see a JSON response with your seeded principal.

## 11. Configure MCP Client

To use the deployed API with the MCP server, update `~/.mostly/config`:

```json
{
  "server_url": "https://mostly.<your-subdomain>.workers.dev",
  "token": "<your-token>",
  "default_actor": "admin"
}
```

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
Check that `MOSTLY_TOKEN` is set: `wrangler secret list`.

**500 Internal Server Error**
Check worker logs: `wrangler tail`.

**"WORKSPACE_ID is empty"**
Set `WORKSPACE_ID` in `wrangler.toml` `[vars]` section.
