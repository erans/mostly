# Mostly

A local-first, agent-friendly task tracker. SQLite-backed, designed for AI agents and humans to collaborate on task management through CLI, HTTP API, or MCP.

## Architecture

Mostly is a pnpm monorepo with seven packages:

| Package | Description |
|---------|-------------|
| `@mostly/types` | Shared types, Zod schemas, enums, and error classes |
| `@mostly/core` | Domain logic: state machine, services, claim system |
| `@mostly/db` | SQLite storage via Drizzle ORM, repositories, migrations |
| `@mostly/server` | HTTP API server (Hono) |
| `@mostly/cli` | Command-line interface (Commander.js) |
| `@mostly/mcp` | MCP server for AI agent integration |
| `@mostly/web` | Web frontend (React + Vite SPA) |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install and Build

```bash
pnpm install
pnpm build
```

### Initialize

```bash
mostly init
```

This prompts for an admin handle and password, creates the database, seeds the default workspace, and generates a one-time workspace **agent token** (used by agents and CI — shown once, then SHA-256 hashed in the database). The admin password is stored as a bcrypt hash. The resulting `~/.mostly/config` holds the server URL, the agent token, and `default_actor` pointing at the admin handle.

### Start the Server

```bash
mostly serve
```

The server runs at `http://localhost:6080` by default.

### Sign In

The admin account from `init` is a real user — sign in to create a per-user API key:

```bash
mostly login
```

This prompts for your handle and password, then stores an API key named `cli-<hostname>` in `~/.mostly/config` under `api_key`. Subsequent CLI commands use the API key automatically (the server resolves your identity from it, so no `--actor` flag is needed).

If you skip `mostly login` and rely on the agent token that `init` wrote, commands still work — `init` also persists `default_actor` pointing at the admin handle, so the CLI knows which principal to act as. Pass `--actor <handle>` on an individual command when you need to override that default (e.g. to act as a different agent for one invocation).

### Basic Usage

```bash
# Create an agent principal. Agents authenticate via the shared workspace
# agent token and identify themselves via `actor_handle` on mutations
# (persisted by `init` as `default_actor`). Humans should use
# `mostly invite` instead so they get their own password and API keys.
mostly principal create --handle build-bot --kind agent

# Create a project
mostly project create --key AUTH --name "Authentication"

# Create a task
mostly task create --title "Add login page" --type feature --project AUTH

# List tasks
mostly task list

# Claim a task for exclusive work
mostly task claim AUTH-1 --ttl 2h

# Transition a task
mostly task start AUTH-1
mostly task close AUTH-1 --resolution completed
```

### Git-aware project inference

When `mostly` commands run inside a git repository that has been linked to a project, they fill in `--project`, `--task`, and `--actor` automatically. Pass `--no-git-context` on any command to skip inference for that invocation.

**Linking a repo to a project**

```bash
cd path/to/your/repo

mostly project link --project AUTH               # link origin to project AUTH
mostly project link --project AUTH --all-remotes # link every remote on the repo
mostly project link --project AUTH --subpath packages/auth  # monorepo subpath

mostly project links                             # list all workspace links
mostly project unlink --project AUTH             # remove the origin link
```

A single repo can have multiple links — one per remote or subpath. For monorepos, the longest matching subpath wins when the CLI resolves the active project.

**Branch → task inference**

The CLI parses the current branch for a pattern matching the linked project key. Any of these resolve to task `AUTH-1`:

- `AUTH-1-add-login` — key prefix
- `feature/AUTH-1` — slash-separated segment
- `eran/AUTH-1-foo` — personal namespace

The project key in the branch must match the linked project exactly (case-sensitive). Branches that contain a different project key are ignored — they will not cause the CLI to switch projects.

**Actor inference from email**

`git config user.email` is matched against principal emails in the workspace. Inactive principals are skipped. If exactly one active principal matches, that handle is used as the actor. If multiple principals share the same email, inference falls back to `default_actor` from `~/.mostly/config`.

Run `mostly login` once to set your email on your principal so inference works for you.

**`mostly whereami` — inference diagnostic**

```
$ mostly whereami
cwd:        /home/eran/work/auth
repo:       /home/eran/work/auth
branch:     AUTH-1-add-login
email:      eran@example.com
remotes:
  origin: github.com/acme/auth
inferred:
  project: AUTH (git:resolve)
  task:    AUTH-1 (git:branch)
  actor:   eran (git:email)
```

`whereami` is read-only and makes no changes.

### MCP Integration

Run the MCP server for AI agent access:

```bash
mostly-mcp
```

This exposes all task operations as MCP tools over stdio, compatible with Claude and other MCP-enabled AI agents.

### Web Frontend

Start the web UI for a browser-based task management interface:

```bash
cd packages/web && pnpm dev
```

The web UI runs at `http://localhost:5173` and connects to the Mostly server at `http://localhost:6080`. On first load, enter the server URL, then sign in with your admin credentials (or register the first user if the database is empty). The session is held in an `httpOnly` cookie. Features include a three-panel layout (sidebar, task list, detail panel), command palette (Cmd+K), task creation, status transitions, claims, an API Keys settings page, and light/dark themes.

## Authentication

Mostly supports three authentication methods, which the server's auth middleware tries in order:

| Method | Used by | How it's obtained |
|--------|---------|-------------------|
| **Session cookie** | Web frontend | `POST /v0/auth/login` sets an `httpOnly`, `SameSite=Lax` cookie with 7-day sliding expiry |
| **Personal API key** (`msk_*`) | CLI, HTTP clients | `mostly login` stores one in `~/.mostly/config`; additional keys via `mostly api-key create <name>` |
| **Agent token** (`mat_*`) | Agents, MCP server, CI | Generated by `mostly init`, shared across all agents in a workspace, paired with an `actor_handle` on each mutating request so the server knows which agent is acting |

Humans authenticated by session or API key have their identity resolved server-side — the `actor_handle`/`actor_id` fields in request bodies are ignored. Agents authenticated by the shared token must include `actor_handle` on mutating requests (the CLI's `default_actor` config field and `--actor` flag, and the MCP server's `MOSTLY_ACTOR` env var, do this automatically). GET requests under agent-token auth do not require an actor.

### First-user registration

`POST /v0/auth/register` is open when no human principals exist yet — the first caller becomes the admin. After that, registration is invite-only unless the workspace has `allow_registration=true`. Use `mostly invite <handle>` or the admin web UI to issue an invite token; the invitee sets their password via the accept-invite flow.

### Admin tasks

- `mostly invite <handle>` — create a one-time invite link for a new user (admin only)
- `mostly principal reset-password <handle>` — admin-only password reset (invalidates existing sessions for that user)
- `mostly api-key list` / `mostly api-key revoke <name>` — manage your own keys

## Key Concepts

### Claims

Tasks support exclusive claims with optional TTL expiry. When an agent claims a task, other agents know the task is being actively worked on. Claims can be renewed or released, and expired claims are automatically reaped.

### State Machine

Tasks follow a defined lifecycle: `open` -> `claimed` -> `in_progress` -> `blocked` -> `closed`/`canceled`. Transitions are validated with appropriate side effects (claim release on close, resolution tracking on terminal states).

### Optimistic Concurrency

All mutations require an `expected_version` parameter. If the task was modified since you last read it, the operation fails with a conflict error rather than silently overwriting changes.

### Workspace Scoping

All entities are scoped to a workspace, preventing cross-tenant data access.

## API

The HTTP API is available at `/v0/` with endpoints for:

- `GET/POST /v0/principals` - Manage users and agents
- `GET/POST /v0/projects` - Manage projects
- `GET/POST /v0/tasks` - CRUD operations on tasks
- `POST /v0/tasks/:id/transition` - Status transitions
- `POST /v0/tasks/:id/claim` - Claim management
- `GET/POST /v0/tasks/:id/updates` - Task updates and notes

All endpoints require authentication. See [Authentication](#authentication) for the three supported methods (session cookie, personal API key, shared agent token).

## Development

```bash
# Run all tests
pnpm test

# Run end-to-end tests
pnpm test:e2e

# Build all packages
pnpm build
```

## Deploying to Cloudflare

For a fresh install or to push updates, run:

    ./scripts/deploy-cloudflare.sh init      # first time
    ./scripts/deploy-cloudflare.sh update    # subsequent deploys

See [`docs/cloudflare-deployment.md`](docs/cloudflare-deployment.md) for
details, custom domain setup, and manual provisioning instructions.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
