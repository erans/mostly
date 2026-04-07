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

This creates `~/.mostly/config` with a generated auth token and default settings.

### Start the Server

```bash
mostly serve
```

The server runs at `http://localhost:6080` by default.

### Basic Usage

```bash
# Create a principal (user or agent)
mostly principal create --handle alice --kind human

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

The web UI runs at `http://localhost:5173` and connects to the Mostly server at `http://localhost:6080`. On first load, enter the server URL and auth token. Features include a three-panel layout (sidebar, task list, detail panel), command palette (Cmd+K), task creation, status transitions, claims, and light/dark themes.

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

All endpoints require Bearer token authentication.

## Development

```bash
# Run all tests
pnpm test

# Run end-to-end tests
pnpm test:e2e

# Build all packages
pnpm build
```

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
