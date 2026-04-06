# E2E Docker Testing Design

## Overview

Add comprehensive E2E tests using Docker to test the full Mostly stack: HTTP API server, CLI, MCP server, and Cloudflare Workers/D1 compatibility. Tests run against a real server process with a real SQLite database, complementing the existing in-memory unit and integration tests.

## Motivation

Current tests use in-memory SQLite and in-process Hono app — they validate logic but skip:

- Real server process startup, port binding, and graceful shutdown
- Real SQLite file persistence and migration execution
- CLI as a real process talking to a real server over HTTP
- MCP server as a real process communicating via JSON-RPC
- Cloudflare Workers/D1 runtime compatibility
- Concurrency scenarios (multiple HTTP clients, competing claims)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Docker structure | docker-compose with server + test-runner | Clean separation, realistic network testing, easy debugging |
| Workers/D1 testing | Miniflare programmatic API | Faster startup, programmatic control, same runtime as wrangler dev |
| Test runner | Vitest | Consistency with existing tests, shared config patterns |
| Existing tests | Keep both (layered) | In-memory tests for fast feedback, Docker E2E for full-stack validation |
| CI target | GitHub Actions + portable | Primary CI on GitHub Actions, docker-compose works anywhere |

## Architecture

### Docker Infrastructure

**Dockerfile** (server image):
- Base: `node:20-slim`
- Install `curl` (for healthcheck) and pnpm
- Copy monorepo, run `pnpm install --frozen-lockfile && pnpm build`
- Entrypoint script (`e2e/docker/entrypoint.sh`): runs `drizzle-kit migrate` against the SQLite DB file, then starts the server via `node packages/server/dist/serve.js`
- Exposes port 6080

**Dockerfile.test** (test runner image):
- Base: `node:20-slim`
- Install pnpm, copy monorepo, run `pnpm install --frozen-lockfile && pnpm build`
- Also installs `miniflare` as a dev dependency
- Entrypoint: `pnpm vitest run --config e2e/docker/vitest.config.ts`

**.dockerignore**:
- Exclude `node_modules/`, `dist/`, `.git/`, `*.db` to keep build context small

**docker-compose.e2e.yml**:

```yaml
services:
  server:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      MOSTLY_TOKEN: test-token-e2e
      MOSTLY_PORT: 6080
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6080/healthz"]
      interval: 2s
      timeout: 5s
      retries: 10
    ports:
      - "6080:6080"

  test-runner:
    build:
      context: .
      dockerfile: Dockerfile.test
    environment:
      SERVER_URL: http://server:6080
      MOSTLY_TOKEN: test-token-e2e
    depends_on:
      server:
        condition: service_healthy
    volumes:
      - type: tmpfs
        target: /tmp/mostly-test
```

The server container stores its SQLite DB on a `tmpfs` mount inside the container (no explicit volume needed — it's ephemeral by default). The test-runner gets a `tmpfs` at `/tmp/mostly-test` for CLI config files and other temp state.

**Run command**: `docker compose -f docker-compose.e2e.yml up --build --exit-code-from test-runner`

### Health Endpoint

Add `GET /healthz` before auth middleware in `app.ts` — returns `200 OK` with no auth required. Useful for Docker healthchecks and production deployments.

## Test Organization

```
e2e/docker/
  vitest.config.ts          # Vitest config for Docker E2E tests
  setup/
    global-setup.ts         # Wait for server health, seed workspace + principals
    global-teardown.ts      # Cleanup if needed
    test-client.ts          # HTTP client wrapper (base URL + auth token from env)
    cli-runner.ts           # Spawns CLI as child process, captures output
    mcp-runner.ts           # Spawns MCP server as stdio process, sends JSON-RPC
  api/
    principals.test.ts      # CRUD + activation/deactivation
    projects.test.ts        # CRUD + archival
    tasks.test.ts           # CRUD + filtering + pagination
    transitions.test.ts     # State machine: all valid/invalid transitions
    claims.test.ts          # Acquire, renew, release, TTL expiry
    updates.test.ts         # Task update audit log
    auth.test.ts            # Token validation, missing/invalid token
    actor.test.ts           # Actor resolution by ID/handle, deactivated principal
    maintenance.test.ts     # Claim reaping
    concurrency.test.ts     # Optimistic locking conflicts, concurrent claims
    server-lifecycle.test.ts # Verify migrations ran, DB file exists
  cli/
    init.test.ts            # mostly init creates config + workspace
    tasks.test.ts           # mostly task create/list/show/transition
    principals.test.ts      # mostly principal create/list
    projects.test.ts        # mostly project create/list
    errors.test.ts          # Invalid commands, missing args, server down
  mcp/
    tools.test.ts           # MCP tool invocations via JSON-RPC
    resources.test.ts       # MCP resource listing
  workers/
    d1-api.test.ts          # Full API through Miniflare Workers runtime
```

### Key Helpers

**test-client.ts**: Thin wrapper around `fetch` pre-configured with `SERVER_URL` and `Authorization: Bearer` header from environment variables. Provides typed methods like `client.post('/v0/tasks', body)`.

**cli-runner.ts**: Spawns `node dist/cli/index.js` as a child process with `--server-url` and `--token` flags pointing at the Docker server. Returns stdout/stderr/exit code.

**mcp-runner.ts**: Spawns the MCP server as a stdio process, sends JSON-RPC messages, collects responses. Points at the Docker server for its backend.

### Execution Strategy

- Vitest runs with `sequence: { concurrent: false }` — test files execute sequentially since they share server state
- `global-setup.ts` creates a fresh workspace + seed principal before all tests
- Each test file creates its own project/tasks within that workspace so tests don't collide
- Server container uses `tmpfs` for the DB — no state leaks between runs

## Test Scenarios

### API Tests

| File | Scenarios |
|------|-----------|
| `auth.test.ts` | Valid token 200, missing header 401, wrong token 401 |
| `actor.test.ts` | Actor by ID, by handle, missing actor on POST 400, deactivated principal 403 |
| `principals.test.ts` | Create, list, get by ID, get by handle, activate/deactivate |
| `projects.test.ts` | Create, list, key prefix uniqueness, archive |
| `tasks.test.ts` | Create, list with status filter, cursor pagination, get by ID, get by short key |
| `transitions.test.ts` | Every valid transition path, every invalid transition returns error |
| `claims.test.ts` | Acquire, renew, release, acquire with TTL, expired claim re-acquisition |
| `updates.test.ts` | Add note, list updates, system-generated updates on transitions |
| `concurrency.test.ts` | Two requests with same expected_version (one 200, one 409), two claims on same task (one succeeds, one fails) |
| `maintenance.test.ts` | Create task with short TTL claim, wait for expiry, reap, verify claim released |
| `server-lifecycle.test.ts` | DB file exists on disk, migration applied (table existence check) |

### CLI Tests

| File | Scenarios |
|------|-----------|
| `init.test.ts` | `mostly init` creates config file with token + server URL, creates workspace |
| `tasks.test.ts` | `mostly task create/list/show/transition` |
| `principals.test.ts` | `mostly principal create/list` |
| `projects.test.ts` | `mostly project create/list` |
| `errors.test.ts` | Missing required args non-zero exit, server unreachable connection error |

### MCP Tests

| File | Scenarios |
|------|-----------|
| `tools.test.ts` | List available tools, invoke create_task, transition_task, list_tasks |
| `resources.test.ts` | List resources, read task resource by URI, read project resource |

### Workers Tests (Miniflare)

| File | Scenarios |
|------|-----------|
| `d1-api.test.ts` | Instantiate Miniflare with D1 binding, apply migration SQL to D1, run Hono app through Workers fetch handler, exercise CRUD (principals, projects, tasks), verify state transitions and claims work identically to the Node.js path |

## CI/CD

### GitHub Actions (`.github/workflows/e2e.yml`)

```yaml
name: E2E Tests
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f docker-compose.e2e.yml up --build --exit-code-from test-runner
      - name: Upload server logs on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: server-logs
          path: /tmp/mostly-e2e-server.log
```

Two parallel jobs: `unit-tests` (fast, no Docker) and `e2e-tests` (Docker-based, full stack).

### Failure Debugging

- Server container logs captured via `docker compose logs server`
- On CI failure, server logs uploaded as GitHub Actions artifact
- Test runner output goes to stdout as normal Vitest output

## Developer Experience

### Commands

| Command | What it runs | Docker required? |
|---------|-------------|-----------------|
| `pnpm test` | Unit + in-memory integration tests | No |
| `pnpm test:e2e` | Existing in-memory E2E smoke test | No |
| `pnpm test:e2e:docker` | Full Docker E2E suite | Yes |
| `pnpm test:e2e:docker:build` | Rebuild Docker images | Yes |
| `pnpm test:e2e:docker:logs` | Tail server container logs | Yes |

### Required Changes to Existing Code

1. **Add `/healthz` endpoint** in `packages/server/src/app.ts` — before auth middleware, returns 200 OK
2. **Add npm scripts** in root `package.json` for Docker E2E commands
3. **Server config via env vars** — the server entrypoint (`serve.ts`) should support `MOSTLY_TOKEN` and `MOSTLY_PORT` environment variables (in addition to config file) for Docker usage
4. **CLI env var support** — the CLI currently reads `~/.mostly/config` for server URL and token. For Docker E2E tests, the `cli-runner.ts` helper will write a temporary config file to `/tmp/mostly-test/.mostly/config` with the Docker server URL and token before spawning CLI commands. This avoids modifying the CLI itself. Set `HOME=/tmp/mostly-test` when spawning the CLI process.
5. **MCP server config** — same approach as CLI: the `mcp-runner.ts` helper sets `HOME=/tmp/mostly-test` so the MCP server reads the test config file
