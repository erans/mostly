# E2E Docker Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive Docker-based E2E tests that test the full Mostly stack — HTTP API, CLI, MCP server, and Cloudflare Workers/D1 — against a real running server process with a real SQLite database.

**Architecture:** Two Docker containers via docker-compose: a server container (builds monorepo, runs migrations, starts server) and a test-runner container (runs Vitest E2E tests, CLI commands, MCP protocol, and Miniflare Workers tests). Tests are organized by component in `e2e/docker/`.

**Tech Stack:** Docker, docker-compose, Vitest, Miniflare (programmatic D1), Hono, better-sqlite3, Node.js 20

**Spec:** `docs/superpowers/specs/2026-04-06-e2e-docker-testing-design.md`

---

## File Structure

### New files to create:
- `.dockerignore` — exclude node_modules, dist, .git from build context
- `Dockerfile` — server image (build monorepo, run migrations, start server)
- `Dockerfile.test` — test runner image (build monorepo, run Vitest E2E tests)
- `docker-compose.e2e.yml` — orchestrates server + test-runner services
- `e2e/docker/entrypoint.sh` — server container entrypoint (migrate + serve)
- `e2e/docker/vitest.config.ts` — Vitest config for Docker E2E tests
- `e2e/docker/setup/global-setup.ts` — seeds workspace + principal before all tests
- `e2e/docker/setup/test-client.ts` — HTTP client wrapper for E2E tests
- `e2e/docker/setup/cli-runner.ts` — spawns CLI as child process
- `e2e/docker/setup/mcp-runner.ts` — spawns MCP server, sends JSON-RPC
- `e2e/docker/api/auth.test.ts` — token validation tests
- `e2e/docker/api/actor.test.ts` — actor resolution tests
- `e2e/docker/api/principals.test.ts` — principal CRUD tests
- `e2e/docker/api/projects.test.ts` — project CRUD tests
- `e2e/docker/api/tasks.test.ts` — task CRUD + filtering + pagination
- `e2e/docker/api/transitions.test.ts` — state machine transitions
- `e2e/docker/api/claims.test.ts` — claim lifecycle + TTL expiry
- `e2e/docker/api/updates.test.ts` — task update audit log
- `e2e/docker/api/concurrency.test.ts` — optimistic locking + concurrent claims
- `e2e/docker/api/maintenance.test.ts` — claim reaping
- `e2e/docker/api/server-lifecycle.test.ts` — migration + DB file verification
- `e2e/docker/cli/init.test.ts` — CLI init creates config + workspace
- `e2e/docker/cli/tasks.test.ts` — CLI task operations
- `e2e/docker/cli/principals.test.ts` — CLI principal operations
- `e2e/docker/cli/projects.test.ts` — CLI project operations
- `e2e/docker/cli/errors.test.ts` — CLI error handling
- `e2e/docker/mcp/tools.test.ts` — MCP tool invocations
- `e2e/docker/mcp/resources.test.ts` — MCP resource reads
- `e2e/docker/workers/d1-api.test.ts` — Miniflare D1 API tests
- `.github/workflows/e2e.yml` — GitHub Actions E2E workflow

### Files to modify:
- `packages/server/src/app.ts:27-58` — add `/healthz` endpoint before auth middleware
- `packages/server/src/serve.ts:20-36` — add env var support for MOSTLY_TOKEN, MOSTLY_PORT, MOSTLY_DB_PATH
- `packages/mcp/src/client.ts:11-17` — add env var support for MOSTLY_SERVER_URL, MOSTLY_TOKEN, MOSTLY_ACTOR
- `package.json:3-10` — add `test:e2e:docker` npm scripts

---

### Task 1: Add /healthz endpoint and server env var support

**Files:**
- Modify: `packages/server/src/app.ts:27-58`
- Modify: `packages/server/src/serve.ts:15-36`
- Test: `packages/server/__tests__/healthz.test.ts`

- [ ] **Step 1: Write the failing test for /healthz**

Create `packages/server/__tests__/healthz.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

describe('GET /healthz', () => {
  it('returns 200 without auth', async () => {
    const { app } = createTestApp();
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('returns 200 even with invalid auth', async () => {
    const { app } = createTestApp();
    const res = await app.request('/healthz', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && pnpm vitest run __tests__/healthz.test.ts`
Expected: FAIL — GET /healthz returns 404 (no route defined)

- [ ] **Step 3: Add /healthz endpoint to app.ts**

In `packages/server/src/app.ts`, add the healthz route before the auth middleware (after the service injection middleware, before `app.use('*', authMiddleware(...))`):

```typescript
export function createApp(deps: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Error handler (outermost — catches DomainError and maps to HTTP status)
  app.onError(errorHandler);

  // Health check — no auth required
  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  // Inject services and workspace into context
  app.use('*', async (c, next) => {
    c.set('workspaceId', deps.workspaceId);
    c.set('actorId', '');
    c.set('parsedBody', {});
    c.set('principalService', deps.principalService);
    c.set('projectService', deps.projectService);
    c.set('taskService', deps.taskService);
    c.set('maintenanceService', deps.maintenanceService);
    await next();
  });

  // Auth middleware — validates bearer token
  app.use('*', authMiddleware(deps.token));

  // Actor resolution — resolves actor from body on mutating requests
  app.use('*', actorMiddleware());

  // API routes
  app.route('/v0/principals', principalRoutes());
  app.route('/v0/projects', projectRoutes());
  app.route('/v0/tasks', taskRoutes());
  app.route('/v0/maintenance', maintenanceRoutes());

  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && pnpm vitest run __tests__/healthz.test.ts`
Expected: PASS

- [ ] **Step 5: Add env var support to serve.ts**

In `packages/server/src/serve.ts`, modify the config loading to support env vars:

```typescript
const MOSTLY_DIR = process.env.MOSTLY_DIR ?? join(homedir(), '.mostly');
const CONFIG_PATH = join(MOSTLY_DIR, 'config');
const DB_PATH = process.env.MOSTLY_DB_PATH ?? join(MOSTLY_DIR, 'mostly.db');
const DEFAULT_PORT = 6080;

interface MostlyConfig {
  port?: number;
  token: string;
  server_url?: string;
}

function loadConfig(): MostlyConfig {
  // Env vars take precedence over config file
  if (process.env.MOSTLY_TOKEN) {
    return {
      token: process.env.MOSTLY_TOKEN,
      port: process.env.MOSTLY_PORT ? parseInt(process.env.MOSTLY_PORT, 10) : DEFAULT_PORT,
    };
  }
  if (!existsSync(CONFIG_PATH)) {
    console.error(`Config not found at ${CONFIG_PATH}. Run 'mostly init' first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}
```

- [ ] **Step 6: Run full server test suite**

Run: `cd packages/server && pnpm vitest run`
Expected: All tests pass (env var changes don't affect existing behavior — env vars are not set in test env)

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/app.ts packages/server/src/serve.ts packages/server/__tests__/healthz.test.ts
git commit -m "feat(server): add /healthz endpoint and env var config support"
```

---

### Task 2: Add env var support to MCP client

**Files:**
- Modify: `packages/mcp/src/client.ts:11-17`

- [ ] **Step 1: Modify MCP loadConfig to support env vars**

In `packages/mcp/src/client.ts`, update the `loadConfig` function:

```typescript
function loadConfig(): MostlyConfig {
  // Env vars take precedence
  const serverUrl = process.env.MOSTLY_SERVER_URL;
  const token = process.env.MOSTLY_TOKEN;
  if (serverUrl && token) {
    return {
      server_url: serverUrl,
      token,
      default_actor: process.env.MOSTLY_ACTOR,
    };
  }

  const configPath = join(homedir(), '.mostly', 'config');
  if (!existsSync(configPath)) {
    throw new Error('Config not found. Run "mostly init" first, or set MOSTLY_SERVER_URL and MOSTLY_TOKEN env vars.');
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}
```

- [ ] **Step 2: Build and verify**

Run: `pnpm -r run build`
Expected: All packages build successfully

- [ ] **Step 3: Commit**

```bash
git add packages/mcp/src/client.ts
git commit -m "feat(mcp): add env var config support for Docker testing"
```

---

### Task 3: Create Docker infrastructure

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile`
- Create: `Dockerfile.test`
- Create: `docker-compose.e2e.yml`
- Create: `e2e/docker/entrypoint.sh`

- [ ] **Step 1: Create .dockerignore**

```
node_modules/
dist/
.git/
*.db
.claude/
docs/
.github/
```

- [ ] **Step 2: Create Dockerfile (server)**

```dockerfile
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/ packages/
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:20-slim

RUN apt-get update && apt-get install -y curl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY --from=builder /app ./

COPY e2e/docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 6080
ENTRYPOINT ["/app/entrypoint.sh"]
```

Note: The final stage needs `python3 make g++` because `better-sqlite3` may need native rebuild. The `curl` is for the Docker healthcheck.

- [ ] **Step 3: Create entrypoint.sh**

Create `e2e/docker/entrypoint.sh`:

```bash
#!/bin/bash
set -e

# Ensure the data directory exists
mkdir -p /data

# Set DB path if not already set
export MOSTLY_DB_PATH="${MOSTLY_DB_PATH:-/data/mostly.db}"

echo "Starting Mostly server..."
echo "  DB: $MOSTLY_DB_PATH"
echo "  Port: ${MOSTLY_PORT:-6080}"

exec node packages/server/dist/serve.js
```

- [ ] **Step 4: Create Dockerfile.test (test runner)**

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/ packages/
COPY e2e/ e2e/
RUN pnpm install --frozen-lockfile
RUN pnpm build

CMD ["pnpm", "vitest", "run", "--config", "e2e/docker/vitest.config.ts"]
```

- [ ] **Step 5: Create docker-compose.e2e.yml**

```yaml
services:
  server:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      MOSTLY_TOKEN: test-token-e2e
      MOSTLY_PORT: "6080"
      MOSTLY_DB_PATH: /data/mostly.db
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:6080/healthz"]
      interval: 2s
      timeout: 5s
      retries: 15
      start_period: 10s
    ports:
      - "6080:6080"

  test-runner:
    build:
      context: .
      dockerfile: Dockerfile.test
    environment:
      SERVER_URL: http://server:6080
      MOSTLY_SERVER_URL: http://server:6080
      MOSTLY_TOKEN: test-token-e2e
      MOSTLY_ACTOR: e2e-agent
    depends_on:
      server:
        condition: service_healthy
```

- [ ] **Step 6: Verify Docker builds**

Run: `docker compose -f docker-compose.e2e.yml build`
Expected: Both images build successfully (test runner will fail on tests since they don't exist yet, but the build step should complete)

- [ ] **Step 7: Commit**

```bash
git add .dockerignore Dockerfile Dockerfile.test docker-compose.e2e.yml e2e/docker/entrypoint.sh
git commit -m "infra: add Docker infrastructure for E2E testing"
```

---

### Task 4: Create test scaffolding

**Files:**
- Create: `e2e/docker/vitest.config.ts`
- Create: `e2e/docker/setup/global-setup.ts`
- Create: `e2e/docker/setup/test-client.ts`

- [ ] **Step 1: Create Vitest config**

Create `e2e/docker/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['e2e/docker/**/*.test.ts'],
    root: resolve(__dirname, '../..'),
    globalSetup: ['e2e/docker/setup/global-setup.ts'],
    sequence: {
      concurrent: false,
    },
    testTimeout: 30000,
  },
});
```

- [ ] **Step 2: Create test-client.ts**

Create `e2e/docker/setup/test-client.ts`:

```typescript
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:6080';
const TOKEN = process.env.MOSTLY_TOKEN ?? 'test-token-e2e';

export interface ApiResponse<T = any> {
  status: number;
  data: T;
  meta?: any;
  error?: { code: string; message: string };
}

class TestClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  private headers(auth: boolean = true): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  async get(path: string, opts?: { auth?: boolean; params?: Record<string, string> }): Promise<ApiResponse> {
    let url = `${this.baseUrl}${path}`;
    if (opts?.params) {
      const qs = new URLSearchParams(opts.params).toString();
      if (qs) url += `?${qs}`;
    }
    const res = await fetch(url, {
      method: 'GET',
      headers: this.headers(opts?.auth ?? true),
    });
    return this.parse(res);
  }

  async post(path: string, body: Record<string, unknown>, opts?: { auth?: boolean }): Promise<ApiResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(opts?.auth ?? true),
      body: JSON.stringify(body),
    });
    return this.parse(res);
  }

  async patch(path: string, body: Record<string, unknown>): Promise<ApiResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return this.parse(res);
  }

  async healthz(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async parse(res: Response): Promise<ApiResponse> {
    const contentType = res.headers.get('content-type') ?? '';
    if (/json/i.test(contentType)) {
      const json = await res.json() as any;
      return {
        status: res.status,
        data: json.data,
        meta: json.meta,
        error: json.error,
      };
    }
    return { status: res.status, data: null };
  }
}

export const client = new TestClient(SERVER_URL, TOKEN);

/**
 * Create a client with a specific token (e.g., for testing invalid auth).
 */
export function clientWithToken(token: string): TestClient {
  return new TestClient(SERVER_URL, token);
}

export function clientNoAuth(): TestClient {
  return new TestClient(SERVER_URL, '');
}

export { SERVER_URL, TOKEN };
```

- [ ] **Step 3: Create global-setup.ts**

Create `e2e/docker/setup/global-setup.ts`:

```typescript
/**
 * Global setup: seed the server with a test workspace and principal.
 * This runs once before all E2E tests.
 */
export async function setup() {
  const serverUrl = process.env.SERVER_URL ?? 'http://localhost:6080';
  const token = process.env.MOSTLY_TOKEN ?? 'test-token-e2e';

  // Wait for server to be healthy (should already be healthy via compose depends_on,
  // but double-check for local runs)
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${serverUrl}/healthz`);
      if (res.ok) break;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Verify server is reachable
  const healthRes = await fetch(`${serverUrl}/healthz`);
  if (!healthRes.ok) {
    throw new Error(`Server not healthy at ${serverUrl}/healthz`);
  }

  // Seed a bootstrap principal that tests can use as an actor.
  // The server auto-creates a default workspace on startup.
  // We need to create a principal to use as actor_id in requests.
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // List existing principals — if our seed principal exists, skip
  const listRes = await fetch(`${serverUrl}/v0/principals`, { headers });
  const listBody = await listRes.json() as any;
  const existing = listBody.data?.items?.find((p: any) => p.handle === 'e2e-agent');

  if (!existing) {
    // We need an actor to create a principal, but no principal exists yet.
    // The server's actor middleware requires an actor for POST requests.
    // However, the serve.ts seeds a default workspace — we need to check
    // if there's a bootstrap mechanism.
    //
    // Looking at the code: actorMiddleware only runs on mutating methods (POST/PATCH/PUT/DELETE),
    // and it requires actor_id or actor_handle in the body that maps to an existing principal.
    // This is a chicken-and-egg problem for the very first principal.
    //
    // The solution: we'll need a bootstrap principal. The server should seed one,
    // or we need to handle this. For now, we pass actor_handle in the body and
    // if the actor middleware allows creating the first principal without validation
    // when no principals exist... let's check.
    //
    // Actually, looking at serve.ts, it doesn't seed a principal.
    // The E2E smoke test (e2e/smoke.test.ts) seeds directly into the DB.
    // For Docker E2E, we need the server to seed a bootstrap principal.
    // We'll add this to the server entrypoint.
    console.log('Note: bootstrap principal should be seeded by server entrypoint');
  }

  // Store the principal info for tests
  process.env.__E2E_SETUP_DONE = 'true';
}

export async function teardown() {
  // Nothing to clean up — Docker containers are ephemeral
}
```

- [ ] **Step 4: Update entrypoint.sh to seed bootstrap principal**

The server's `serve.ts` already seeds a default workspace, but not a bootstrap principal. We need to update the entrypoint or `serve.ts` to seed a bootstrap principal when `MOSTLY_BOOTSTRAP_ACTOR` is set.

Update `e2e/docker/entrypoint.sh`:

```bash
#!/bin/bash
set -e

# Ensure the data directory exists
mkdir -p /data

# Set DB path if not already set
export MOSTLY_DB_PATH="${MOSTLY_DB_PATH:-/data/mostly.db}"

echo "Starting Mostly server..."
echo "  DB: $MOSTLY_DB_PATH"
echo "  Port: ${MOSTLY_PORT:-6080}"

exec node packages/server/dist/serve.js
```

And update `packages/server/src/serve.ts` to seed a bootstrap principal when `MOSTLY_BOOTSTRAP_ACTOR` env var is set. Add this after the workspace seeding block (after line 70):

```typescript
  // Seed bootstrap principal if env var is set (for Docker E2E testing)
  if (process.env.MOSTLY_BOOTSTRAP_ACTOR) {
    const handle = process.env.MOSTLY_BOOTSTRAP_ACTOR;
    try {
      await repos.principals.getByHandle(workspace.id, handle);
      console.log(`Bootstrap principal '${handle}' already exists`);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      const now = new Date().toISOString();
      await repos.principals.create({
        id: generateId(ID_PREFIXES.principal),
        workspace_id: workspace.id,
        handle,
        kind: 'agent',
        display_name: `Bootstrap Agent (${handle})`,
        metadata_json: null,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
      console.log(`Created bootstrap principal: ${handle}`);
    }
  }
```

Then update `docker-compose.e2e.yml` server environment to include:

```yaml
    environment:
      MOSTLY_TOKEN: test-token-e2e
      MOSTLY_PORT: "6080"
      MOSTLY_DB_PATH: /data/mostly.db
      MOSTLY_BOOTSTRAP_ACTOR: e2e-agent
```

- [ ] **Step 5: Simplify global-setup.ts**

Now that the server seeds the bootstrap principal, simplify `e2e/docker/setup/global-setup.ts`:

```typescript
export async function setup() {
  const serverUrl = process.env.SERVER_URL ?? 'http://localhost:6080';

  // Wait for server to be healthy
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${serverUrl}/healthz`);
      if (res.ok) break;
    } catch {
      // Server not ready yet
    }
    if (i === 29) throw new Error(`Server not healthy at ${serverUrl}/healthz after 30s`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log('E2E global setup complete — server is healthy');
}

export async function teardown() {
  // Docker containers are ephemeral — nothing to clean up
}
```

- [ ] **Step 6: Commit**

```bash
git add e2e/docker/vitest.config.ts e2e/docker/setup/global-setup.ts e2e/docker/setup/test-client.ts
git add packages/server/src/serve.ts docker-compose.e2e.yml
git commit -m "feat: add E2E test scaffolding with global setup and test client"
```

---

### Task 5: API E2E tests — auth and server lifecycle

**Files:**
- Create: `e2e/docker/api/auth.test.ts`
- Create: `e2e/docker/api/server-lifecycle.test.ts`

- [ ] **Step 1: Write auth.test.ts**

Create `e2e/docker/api/auth.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { client, clientWithToken, SERVER_URL } from '../setup/test-client.js';

describe('Authentication', () => {
  it('allows requests with valid token', async () => {
    const res = await client.get('/v0/principals');
    expect(res.status).toBe(200);
  });

  it('rejects requests with no Authorization header', async () => {
    const res = await fetch(`${SERVER_URL}/v0/principals`);
    expect(res.status).toBe(401);
  });

  it('rejects requests with invalid token', async () => {
    const badClient = clientWithToken('wrong-token');
    const res = await badClient.get('/v0/principals');
    expect(res.status).toBe(401);
  });

  it('rejects requests with empty Bearer token', async () => {
    const emptyClient = clientWithToken('');
    const res = await emptyClient.get('/v0/principals');
    expect(res.status).toBe(401);
  });

  it('allows /healthz without auth', async () => {
    const res = await fetch(`${SERVER_URL}/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Write server-lifecycle.test.ts**

Create `e2e/docker/api/server-lifecycle.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Server lifecycle', () => {
  it('has a healthy server', async () => {
    const healthy = await client.healthz();
    expect(healthy).toBe(true);
  });

  it('ran migrations (workspace table exists)', async () => {
    // If migrations ran, the server seeded a default workspace.
    // We can verify by listing principals (which requires a working DB).
    const res = await client.get('/v0/principals');
    expect(res.status).toBe(200);
    expect(res.data).toBeDefined();
  });

  it('seeded bootstrap principal', async () => {
    const res = await client.get('/v0/principals/e2e-agent');
    expect(res.status).toBe(200);
    expect(res.data.handle).toBe('e2e-agent');
    expect(res.data.kind).toBe('agent');
    expect(res.data.is_active).toBe(true);
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add e2e/docker/api/auth.test.ts e2e/docker/api/server-lifecycle.test.ts
git commit -m "test(e2e): add auth and server lifecycle tests"
```

---

### Task 6: API E2E tests — CRUD (principals, projects, tasks)

**Files:**
- Create: `e2e/docker/api/principals.test.ts`
- Create: `e2e/docker/api/projects.test.ts`
- Create: `e2e/docker/api/tasks.test.ts`

- [ ] **Step 1: Write principals.test.ts**

Create `e2e/docker/api/principals.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Principals CRUD', () => {
  const actorId = 'e2e-agent';
  let createdPrincipalId: string;

  it('creates a principal', async () => {
    const res = await client.post('/v0/principals', {
      handle: 'test-human-1',
      kind: 'human',
      display_name: 'Test Human',
      actor_handle: actorId,
    });
    expect(res.status).toBe(200);
    expect(res.data.handle).toBe('test-human-1');
    expect(res.data.kind).toBe('human');
    expect(res.data.display_name).toBe('Test Human');
    expect(res.data.is_active).toBe(true);
    expect(res.data.id).toMatch(/^prin_/);
    createdPrincipalId = res.data.id;
  });

  it('lists principals', async () => {
    const res = await client.get('/v0/principals');
    expect(res.status).toBe(200);
    expect(res.data.items.length).toBeGreaterThanOrEqual(2); // bootstrap + created
    const handles = res.data.items.map((p: any) => p.handle);
    expect(handles).toContain('e2e-agent');
    expect(handles).toContain('test-human-1');
  });

  it('gets principal by ID', async () => {
    const res = await client.get(`/v0/principals/${createdPrincipalId}`);
    expect(res.status).toBe(200);
    expect(res.data.id).toBe(createdPrincipalId);
    expect(res.data.handle).toBe('test-human-1');
  });

  it('gets principal by handle', async () => {
    const res = await client.get('/v0/principals/test-human-1');
    expect(res.status).toBe(200);
    expect(res.data.handle).toBe('test-human-1');
  });

  it('rejects duplicate handle', async () => {
    const res = await client.post('/v0/principals', {
      handle: 'test-human-1',
      kind: 'human',
      display_name: 'Duplicate',
      actor_handle: actorId,
    });
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown principal', async () => {
    const res = await client.get('/v0/principals/nonexistent');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Write projects.test.ts**

Create `e2e/docker/api/projects.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Projects CRUD', () => {
  const actor = 'e2e-agent';
  let projectId: string;

  it('creates a project', async () => {
    const res = await client.post('/v0/projects', {
      key: 'E2E',
      name: 'E2E Test Project',
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.key).toBe('E2E');
    expect(res.data.name).toBe('E2E Test Project');
    expect(res.data.id).toMatch(/^proj_/);
    projectId = res.data.id;
  });

  it('lists projects', async () => {
    const res = await client.get('/v0/projects');
    expect(res.status).toBe(200);
    expect(res.data.items.length).toBeGreaterThanOrEqual(1);
    expect(res.data.items.some((p: any) => p.key === 'E2E')).toBe(true);
  });

  it('rejects duplicate project key', async () => {
    const res = await client.post('/v0/projects', {
      key: 'E2E',
      name: 'Duplicate',
      actor_handle: actor,
    });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 3: Write tasks.test.ts**

Create `e2e/docker/api/tasks.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Tasks CRUD', () => {
  const actor = 'e2e-agent';
  let projectId: string;
  let taskId: string;
  let taskKey: string;

  it('creates a project for tasks', async () => {
    const res = await client.post('/v0/projects', {
      key: 'TSK',
      name: 'Task Test Project',
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    projectId = res.data.id;
  });

  it('creates a task', async () => {
    const res = await client.post('/v0/tasks', {
      title: 'First E2E task',
      type: 'feature',
      project_id: projectId,
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.title).toBe('First E2E task');
    expect(res.data.type).toBe('feature');
    expect(res.data.status).toBe('open');
    expect(res.data.key).toBe('TSK-1');
    expect(res.data.version).toBe(1);
    expect(res.data.id).toMatch(/^tsk_/);
    taskId = res.data.id;
    taskKey = res.data.key;
  });

  it('creates a second task with auto-incremented key', async () => {
    const res = await client.post('/v0/tasks', {
      title: 'Second E2E task',
      type: 'bug',
      project_id: projectId,
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.key).toBe('TSK-2');
  });

  it('gets task by ID', async () => {
    const res = await client.get(`/v0/tasks/${taskId}`);
    expect(res.status).toBe(200);
    expect(res.data.id).toBe(taskId);
    expect(res.data.title).toBe('First E2E task');
  });

  it('gets task by key', async () => {
    const res = await client.get(`/v0/tasks/${taskKey}`);
    expect(res.status).toBe(200);
    expect(res.data.key).toBe(taskKey);
  });

  it('lists tasks', async () => {
    const res = await client.get('/v0/tasks');
    expect(res.status).toBe(200);
    expect(res.data.items.length).toBeGreaterThanOrEqual(2);
  });

  it('filters tasks by status', async () => {
    const res = await client.get('/v0/tasks', { params: { status: 'open' } });
    expect(res.status).toBe(200);
    for (const task of res.data.items) {
      expect(task.status).toBe('open');
    }
  });

  it('filters tasks by project', async () => {
    const res = await client.get('/v0/tasks', { params: { project_id: projectId } });
    expect(res.status).toBe(200);
    for (const task of res.data.items) {
      expect(task.project_id).toBe(projectId);
    }
  });

  it('returns 404 for unknown task', async () => {
    const res = await client.get('/v0/tasks/tsk_nonexistent');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add e2e/docker/api/principals.test.ts e2e/docker/api/projects.test.ts e2e/docker/api/tasks.test.ts
git commit -m "test(e2e): add principals, projects, and tasks CRUD tests"
```

---

### Task 7: API E2E tests — transitions, claims, updates, actor

**Files:**
- Create: `e2e/docker/api/transitions.test.ts`
- Create: `e2e/docker/api/claims.test.ts`
- Create: `e2e/docker/api/updates.test.ts`
- Create: `e2e/docker/api/actor.test.ts`

- [ ] **Step 1: Write transitions.test.ts**

Create `e2e/docker/api/transitions.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Task transitions', () => {
  const actor = 'e2e-agent';
  let projectId: string;

  async function createTask(title: string) {
    const res = await client.post('/v0/tasks', {
      title,
      type: 'feature',
      project_id: projectId,
      actor_handle: actor,
    });
    return res.data;
  }

  it('setup: create project', async () => {
    const res = await client.post('/v0/projects', {
      key: 'TRAN',
      name: 'Transition Tests',
      actor_handle: actor,
    });
    projectId = res.data.id;
  });

  it('open -> claimed (via claim endpoint)', async () => {
    const task = await createTask('claim-test');
    const res = await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version,
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('claimed');
    expect(res.data.claimed_by_id).toBeTruthy();
  });

  it('claimed -> in_progress', async () => {
    const task = await createTask('start-test');
    const claimed = (await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version,
      actor_handle: actor,
    })).data;

    const res = await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'in_progress',
      expected_version: claimed.version,
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('in_progress');
  });

  it('in_progress -> blocked', async () => {
    const task = await createTask('block-test');
    const claimed = (await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    })).data;
    const started = (await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'in_progress', expected_version: claimed.version, actor_handle: actor,
    })).data;

    const res = await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'blocked',
      expected_version: started.version,
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('blocked');
  });

  it('in_progress -> closed with resolution', async () => {
    const task = await createTask('close-test');
    const claimed = (await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    })).data;
    const started = (await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'in_progress', expected_version: claimed.version, actor_handle: actor,
    })).data;

    const res = await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'closed',
      resolution: 'completed',
      expected_version: started.version,
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('closed');
    expect(res.data.resolution).toBe('completed');
    expect(res.data.resolved_at).toBeTruthy();
  });

  it('rejects invalid transition (open -> in_progress)', async () => {
    const task = await createTask('invalid-transition');
    const res = await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'in_progress',
      expected_version: task.version,
      actor_handle: actor,
    });
    expect(res.status).toBe(422);
  });

  it('rejects invalid transition (open -> closed)', async () => {
    const task = await createTask('invalid-close');
    const res = await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'closed',
      resolution: 'completed',
      expected_version: task.version,
      actor_handle: actor,
    });
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Write claims.test.ts**

Create `e2e/docker/api/claims.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Task claims', () => {
  const actor = 'e2e-agent';
  let projectId: string;

  async function createTask(title: string) {
    const res = await client.post('/v0/tasks', {
      title, type: 'feature', project_id: projectId, actor_handle: actor,
    });
    return res.data;
  }

  it('setup: create project', async () => {
    const res = await client.post('/v0/projects', {
      key: 'CLM', name: 'Claim Tests', actor_handle: actor,
    });
    projectId = res.data.id;
  });

  it('acquires a claim', async () => {
    const task = await createTask('claim-acquire');
    const res = await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version,
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('claimed');
    expect(res.data.claimed_by_id).toBeTruthy();
  });

  it('acquires a claim with TTL', async () => {
    const task = await createTask('claim-ttl');
    const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour
    const res = await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version,
      claim_expires_at: expiresAt,
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.claim_expires_at).toBeTruthy();
  });

  it('renews a claim', async () => {
    const task = await createTask('claim-renew');
    const claimed = (await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    })).data;

    const newExpiry = new Date(Date.now() + 7200000).toISOString(); // 2 hours
    const res = await client.post(`/v0/tasks/${task.id}/renew-claim`, {
      expected_version: claimed.version,
      claim_expires_at: newExpiry,
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.claim_expires_at).toBeTruthy();
  });

  it('releases a claim', async () => {
    const task = await createTask('claim-release');
    const claimed = (await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    })).data;

    const res = await client.post(`/v0/tasks/${task.id}/release-claim`, {
      expected_version: claimed.version,
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('open');
    expect(res.data.claimed_by_id).toBeNull();
  });

  it('rejects double claim on same task', async () => {
    // Create second principal
    await client.post('/v0/principals', {
      handle: 'claim-agent-2',
      kind: 'agent',
      display_name: 'Claim Agent 2',
      actor_handle: actor,
    });

    const task = await createTask('double-claim');
    // First claim succeeds
    const claimed = (await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    })).data;

    // Second claim fails (version mismatch)
    const res = await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, // stale version
      actor_handle: 'claim-agent-2',
    });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 3: Write updates.test.ts**

Create `e2e/docker/api/updates.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Task updates', () => {
  const actor = 'e2e-agent';
  let projectId: string;
  let taskId: string;

  it('setup: create project and task', async () => {
    const projRes = await client.post('/v0/projects', {
      key: 'UPD', name: 'Update Tests', actor_handle: actor,
    });
    projectId = projRes.data.id;

    const taskRes = await client.post('/v0/tasks', {
      title: 'Task with updates', type: 'feature', project_id: projectId, actor_handle: actor,
    });
    taskId = taskRes.data.id;
  });

  it('adds a note update', async () => {
    const res = await client.post(`/v0/tasks/${taskId}/updates`, {
      kind: 'note',
      body: 'This is a test note.',
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.kind).toBe('note');
    expect(res.data.body).toBe('This is a test note.');
    expect(res.data.id).toMatch(/^upd_/);
  });

  it('lists task updates', async () => {
    const res = await client.get(`/v0/tasks/${taskId}/updates`);
    expect(res.status).toBe(200);
    expect(res.data.items.length).toBeGreaterThanOrEqual(1);
    const note = res.data.items.find((u: any) => u.kind === 'note');
    expect(note).toBeDefined();
    expect(note.body).toBe('This is a test note.');
  });

  it('adds multiple updates', async () => {
    await client.post(`/v0/tasks/${taskId}/updates`, {
      kind: 'note', body: 'Second note.', actor_handle: actor,
    });
    await client.post(`/v0/tasks/${taskId}/updates`, {
      kind: 'note', body: 'Third note.', actor_handle: actor,
    });
    const res = await client.get(`/v0/tasks/${taskId}/updates`);
    expect(res.data.items.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 4: Write actor.test.ts**

Create `e2e/docker/api/actor.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Actor resolution', () => {
  const actor = 'e2e-agent';

  it('resolves actor by handle', async () => {
    const res = await client.post('/v0/projects', {
      key: 'ACTR',
      name: 'Actor Test',
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
  });

  it('rejects POST without actor', async () => {
    const res = await client.post('/v0/projects', {
      key: 'NOACTR',
      name: 'No Actor',
      // Missing actor_handle and actor_id
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown actor handle', async () => {
    const res = await client.post('/v0/projects', {
      key: 'BADACTR',
      name: 'Bad Actor',
      actor_handle: 'nonexistent-agent',
    });
    expect(res.status).toBe(404);
  });

  it('rejects deactivated principal as actor', async () => {
    // Create a principal and deactivate it
    const createRes = await client.post('/v0/principals', {
      handle: 'deactivated-agent',
      kind: 'agent',
      display_name: 'Deactivated',
      actor_handle: actor,
    });
    const principalId = createRes.data.id;

    // Deactivate
    await client.patch(`/v0/principals/${principalId}`, {
      is_active: false,
      actor_handle: actor,
    });

    // Try to use deactivated principal as actor
    const res = await client.post('/v0/projects', {
      key: 'DEACT',
      name: 'Deactivated actor test',
      actor_handle: 'deactivated-agent',
    });
    // Should be rejected (403 or 400 depending on implementation)
    expect([400, 403]).toContain(res.status);
  });
});
```

- [ ] **Step 5: Commit**

```bash
git add e2e/docker/api/transitions.test.ts e2e/docker/api/claims.test.ts e2e/docker/api/updates.test.ts e2e/docker/api/actor.test.ts
git commit -m "test(e2e): add transitions, claims, updates, and actor tests"
```

---

### Task 8: API E2E tests — concurrency and maintenance

**Files:**
- Create: `e2e/docker/api/concurrency.test.ts`
- Create: `e2e/docker/api/maintenance.test.ts`

- [ ] **Step 1: Write concurrency.test.ts**

Create `e2e/docker/api/concurrency.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Concurrency', () => {
  const actor = 'e2e-agent';
  let projectId: string;

  it('setup: create project', async () => {
    const res = await client.post('/v0/projects', {
      key: 'CONC', name: 'Concurrency Tests', actor_handle: actor,
    });
    projectId = res.data.id;
  });

  it('optimistic locking: one succeeds, one gets 409', async () => {
    const task = (await client.post('/v0/tasks', {
      title: 'Locking test', type: 'feature', project_id: projectId, actor_handle: actor,
    })).data;

    // Both requests use the same expected_version
    const [res1, res2] = await Promise.all([
      client.post(`/v0/tasks/${task.id}/claim`, {
        expected_version: task.version, actor_handle: actor,
      }),
      client.post(`/v0/tasks/${task.id}/claim`, {
        expected_version: task.version, actor_handle: actor,
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('stale version is rejected', async () => {
    const task = (await client.post('/v0/tasks', {
      title: 'Stale version', type: 'bug', project_id: projectId, actor_handle: actor,
    })).data;

    // Claim the task (bumps version)
    await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    });

    // Try to claim with stale version
    const res = await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, // stale
      actor_handle: actor,
    });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Write maintenance.test.ts**

Create `e2e/docker/api/maintenance.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Maintenance', () => {
  const actor = 'e2e-agent';
  let projectId: string;

  it('setup: create project', async () => {
    const res = await client.post('/v0/projects', {
      key: 'MAINT', name: 'Maintenance Tests', actor_handle: actor,
    });
    projectId = res.data.id;
  });

  it('reaps expired claims', async () => {
    // Create task and claim with very short TTL (already expired)
    const task = (await client.post('/v0/tasks', {
      title: 'Expiring claim', type: 'chore', project_id: projectId, actor_handle: actor,
    })).data;

    const pastExpiry = new Date(Date.now() - 1000).toISOString(); // 1 second ago
    await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version,
      claim_expires_at: pastExpiry,
      actor_handle: actor,
    });

    // Reap expired claims
    const reapRes = await client.post('/v0/maintenance/reap-expired-claims', {
      actor_handle: actor,
    });
    expect(reapRes.status).toBe(200);

    // Verify the task is back to open
    const taskRes = await client.get(`/v0/tasks/${task.id}`);
    expect(taskRes.data.status).toBe('open');
    expect(taskRes.data.claimed_by_id).toBeNull();
  });

  it('does not reap non-expired claims', async () => {
    const task = (await client.post('/v0/tasks', {
      title: 'Active claim', type: 'feature', project_id: projectId, actor_handle: actor,
    })).data;

    const futureExpiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
    const claimed = (await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version,
      claim_expires_at: futureExpiry,
      actor_handle: actor,
    })).data;

    await client.post('/v0/maintenance/reap-expired-claims', { actor_handle: actor });

    // Task should still be claimed
    const taskRes = await client.get(`/v0/tasks/${task.id}`);
    expect(taskRes.data.status).toBe('claimed');
    expect(taskRes.data.claimed_by_id).toBeTruthy();
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add e2e/docker/api/concurrency.test.ts e2e/docker/api/maintenance.test.ts
git commit -m "test(e2e): add concurrency and maintenance tests"
```

---

### Task 9: CLI E2E tests

**Files:**
- Create: `e2e/docker/setup/cli-runner.ts`
- Create: `e2e/docker/cli/init.test.ts`
- Create: `e2e/docker/cli/tasks.test.ts`
- Create: `e2e/docker/cli/principals.test.ts`
- Create: `e2e/docker/cli/projects.test.ts`
- Create: `e2e/docker/cli/errors.test.ts`

- [ ] **Step 1: Write cli-runner.ts**

Create `e2e/docker/setup/cli-runner.ts`:

```typescript
import { execFile } from 'child_process';
import { resolve } from 'path';

const CLI_PATH = resolve(__dirname, '../../../packages/cli/dist/index.js');
const SERVER_URL = process.env.MOSTLY_SERVER_URL ?? process.env.SERVER_URL ?? 'http://localhost:6080';
const TOKEN = process.env.MOSTLY_TOKEN ?? 'test-token-e2e';
const ACTOR = process.env.MOSTLY_ACTOR ?? 'e2e-agent';

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a mostly CLI command. The CLI supports MOSTLY_SERVER_URL, MOSTLY_TOKEN,
 * and MOSTLY_ACTOR env vars (see packages/cli/src/config.ts).
 */
export function runCli(args: string[]): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile('node', [CLI_PATH, ...args], {
      env: {
        ...process.env,
        MOSTLY_SERVER_URL: SERVER_URL,
        MOSTLY_TOKEN: TOKEN,
        MOSTLY_ACTOR: ACTOR,
      },
      timeout: 15000,
    }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error?.code ? (typeof error.code === 'number' ? error.code : 1) : 0,
      });
    });
  });
}

/**
 * Run CLI and parse JSON output.
 */
export async function runCliJson(args: string[]): Promise<{ result: any; exitCode: number }> {
  const { stdout, exitCode } = await runCli([...args, '--json']);
  let result = null;
  try {
    result = JSON.parse(stdout);
  } catch {
    // Not JSON output
  }
  return { result, exitCode };
}
```

- [ ] **Step 2: Write cli/init.test.ts**

Create `e2e/docker/cli/init.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { execFile } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';

const CLI_PATH = resolve(__dirname, '../../../packages/cli/dist/index.js');
const TEST_HOME = '/tmp/mostly-init-test';

function runInit(args: string[] = []): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile('node', [CLI_PATH, 'init', ...args], {
      env: {
        ...process.env,
        HOME: TEST_HOME,
        // Unset server env vars so init doesn't try to connect
        MOSTLY_SERVER_URL: undefined,
        MOSTLY_TOKEN: undefined,
      },
      timeout: 15000,
    }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error?.code ? (typeof error.code === 'number' ? error.code : 1) : 0,
      });
    });
  });
}

describe('CLI: init', () => {
  beforeEach(() => {
    // Clean up temp directory before each test
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true });
    }
    mkdirSync(TEST_HOME, { recursive: true });
  });

  it('creates config and database', async () => {
    const { stdout, exitCode } = await runInit();
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Config written');
    expect(stdout).toContain('Database created');
    expect(existsSync(join(TEST_HOME, '.mostly', 'config'))).toBe(true);
    expect(existsSync(join(TEST_HOME, '.mostly', 'mostly.db'))).toBe(true);
  });

  it('refuses to overwrite without --force', async () => {
    await runInit(); // First init
    const { stdout, exitCode } = await runInit(); // Second init
    expect(exitCode).toBe(0);
    expect(stdout).toContain('already exists');
  });

  it('overwrites with --force', async () => {
    await runInit(); // First init
    const { stdout, exitCode } = await runInit(['--force']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Config written');
  });
});
```

- [ ] **Step 3: Write cli/tasks.test.ts**

Create `e2e/docker/cli/tasks.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { runCli, runCliJson } from '../setup/cli-runner.js';
import { client } from '../setup/test-client.js';

describe('CLI: task operations', () => {
  const actor = 'e2e-agent';
  let projectId: string;

  it('setup: create project via API', async () => {
    const res = await client.post('/v0/projects', {
      key: 'CCLI', name: 'CLI Test Project', actor_handle: actor,
    });
    projectId = res.data.id;
  });

  it('creates a task', async () => {
    const { result, exitCode } = await runCliJson([
      'task', 'create', '--title', 'CLI task', '--type', 'feature', '--project', projectId,
    ]);
    expect(exitCode).toBe(0);
    expect(result.title).toBe('CLI task');
    expect(result.status).toBe('open');
    expect(result.key).toBe('CCLI-1');
  });

  it('lists tasks', async () => {
    const { stdout, exitCode } = await runCli(['task', 'list']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('CLI task');
  });

  it('shows a task by key', async () => {
    const { stdout, exitCode } = await runCli(['task', 'show', 'CCLI-1']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('CCLI-1');
    expect(stdout).toContain('CLI task');
  });

  it('claims a task', async () => {
    const { result, exitCode } = await runCliJson(['task', 'claim', 'CCLI-1']);
    expect(exitCode).toBe(0);
    expect(result.status).toBe('claimed');
  });

  it('starts a task', async () => {
    const { result, exitCode } = await runCliJson(['task', 'start', 'CCLI-1']);
    expect(exitCode).toBe(0);
    expect(result.status).toBe('in_progress');
  });

  it('closes a task', async () => {
    const { result, exitCode } = await runCliJson(['task', 'close', 'CCLI-1']);
    expect(exitCode).toBe(0);
    expect(result.status).toBe('completed');
  });
});
```

- [ ] **Step 3: Write cli/principals.test.ts**

Create `e2e/docker/cli/principals.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { runCli, runCliJson } from '../setup/cli-runner.js';

describe('CLI: principal operations', () => {
  it('creates a principal', async () => {
    const { result, exitCode } = await runCliJson([
      'principal', 'create', '--handle', 'cli-test-agent', '--kind', 'agent', '--display-name', 'CLI Test Agent',
    ]);
    expect(exitCode).toBe(0);
    expect(result.handle).toBe('cli-test-agent');
  });

  it('lists principals', async () => {
    const { stdout, exitCode } = await runCli(['principal', 'list']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('e2e-agent');
    expect(stdout).toContain('cli-test-agent');
  });
});
```

- [ ] **Step 4: Write cli/projects.test.ts**

Create `e2e/docker/cli/projects.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { runCli, runCliJson } from '../setup/cli-runner.js';

describe('CLI: project operations', () => {
  it('creates a project', async () => {
    const { result, exitCode } = await runCliJson([
      'project', 'create', '--key', 'CLIP', '--name', 'CLI Project Test',
    ]);
    expect(exitCode).toBe(0);
    expect(result.key).toBe('CLIP');
  });

  it('lists projects', async () => {
    const { stdout, exitCode } = await runCli(['project', 'list']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('CLIP');
  });
});
```

- [ ] **Step 5: Write cli/errors.test.ts**

Create `e2e/docker/cli/errors.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { runCli } from '../setup/cli-runner.js';
import { execFile } from 'child_process';
import { resolve } from 'path';

const CLI_PATH = resolve(__dirname, '../../../packages/cli/dist/index.js');

describe('CLI: error handling', () => {
  it('fails with missing required args', async () => {
    const { exitCode, stderr } = await runCli(['task', 'create']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('required');
  });

  it('fails with unreachable server', async () => {
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      execFile('node', [CLI_PATH, 'task', 'list'], {
        env: {
          ...process.env,
          MOSTLY_SERVER_URL: 'http://localhost:59999',
          MOSTLY_TOKEN: 'test-token-e2e',
          MOSTLY_ACTOR: 'e2e-agent',
        },
        timeout: 10000,
      }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: error?.code ? (typeof error.code === 'number' ? error.code : 1) : 0,
        });
      });
    });
    expect(result.exitCode).not.toBe(0);
  });

  it('fails with invalid token', async () => {
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      execFile('node', [CLI_PATH, 'task', 'list'], {
        env: {
          ...process.env,
          MOSTLY_SERVER_URL: process.env.SERVER_URL ?? 'http://localhost:6080',
          MOSTLY_TOKEN: 'wrong-token',
          MOSTLY_ACTOR: 'e2e-agent',
        },
        timeout: 10000,
      }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: error?.code ? (typeof error.code === 'number' ? error.code : 1) : 0,
        });
      });
    });
    expect(result.exitCode).not.toBe(0);
  });
});
```

- [ ] **Step 6: Commit**

```bash
git add e2e/docker/setup/cli-runner.ts e2e/docker/cli/
git commit -m "test(e2e): add CLI E2E tests (init, tasks, principals, projects, errors)"
```

---

### Task 10: MCP E2E tests

**Files:**
- Create: `e2e/docker/setup/mcp-runner.ts`
- Create: `e2e/docker/mcp/tools.test.ts`
- Create: `e2e/docker/mcp/resources.test.ts`

- [ ] **Step 1: Write mcp-runner.ts**

Create `e2e/docker/setup/mcp-runner.ts`:

```typescript
import { spawn } from 'child_process';
import { resolve } from 'path';
import { randomBytes } from 'crypto';

const MCP_PATH = resolve(__dirname, '../../../packages/mcp/dist/index.js');
const SERVER_URL = process.env.MOSTLY_SERVER_URL ?? process.env.SERVER_URL ?? 'http://localhost:6080';
const TOKEN = process.env.MOSTLY_TOKEN ?? 'test-token-e2e';
const ACTOR = process.env.MOSTLY_ACTOR ?? 'e2e-agent';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

/**
 * Spawn the MCP server as a stdio process and communicate via JSON-RPC.
 */
export class McpTestRunner {
  private proc: ReturnType<typeof spawn> | null = null;
  private buffer = '';
  private pending = new Map<string | number, {
    resolve: (val: JsonRpcResponse) => void;
    reject: (err: Error) => void;
  }>();
  private nextId = 1;

  async start(): Promise<void> {
    this.proc = spawn('node', [MCP_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MOSTLY_SERVER_URL: SERVER_URL,
        MOSTLY_TOKEN: TOKEN,
        MOSTLY_ACTOR: ACTOR,
      },
    });

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.proc.stderr!.on('data', (chunk: Buffer) => {
      // MCP servers may log to stderr — ignore for now
    });

    // Initialize the MCP connection
    const initResult = await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e-test', version: '1.0.0' },
    });

    // Send initialized notification
    this.sendNotification('notifications/initialized', {});

    return;
  }

  async send(method: string, params?: any): Promise<any> {
    if (!this.proc) throw new Error('MCP server not started');
    const id = this.nextId++;
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const msg = JSON.stringify(request);
    this.proc.stdin!.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);

    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, 10000);

      this.pending.set(id, {
        resolve: (res) => {
          clearTimeout(timeout);
          if (res.error) reject(new Error(res.error.message));
          else resolve(res.result);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });
    });
  }

  sendNotification(method: string, params?: any): void {
    if (!this.proc) return;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
    this.proc.stdin!.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);
  }

  private processBuffer(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + contentLength) break;

      const body = this.buffer.slice(bodyStart, bodyStart + contentLength);
      this.buffer = this.buffer.slice(bodyStart + contentLength);

      try {
        const response = JSON.parse(body) as JsonRpcResponse;
        if (response.id !== undefined && this.pending.has(response.id)) {
          const handler = this.pending.get(response.id)!;
          this.pending.delete(response.id);
          handler.resolve(response);
        }
      } catch {
        // Malformed JSON — skip
      }
    }
  }

  async stop(): Promise<void> {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }
}
```

- [ ] **Step 2: Write mcp/tools.test.ts**

Create `e2e/docker/mcp/tools.test.ts`:

```typescript
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { McpTestRunner } from '../setup/mcp-runner.js';
import { client } from '../setup/test-client.js';

describe('MCP tools', () => {
  const mcp = new McpTestRunner();
  const actor = 'e2e-agent';
  let projectId: string;

  beforeAll(async () => {
    // Create test project via API
    const res = await client.post('/v0/projects', {
      key: 'MCP', name: 'MCP Test Project', actor_handle: actor,
    });
    projectId = res.data.id;

    // Start MCP server
    await mcp.start();
  });

  afterAll(async () => {
    await mcp.stop();
  });

  it('lists available tools', async () => {
    const result = await mcp.send('tools/list', {});
    expect(result.tools).toBeDefined();
    expect(Array.isArray(result.tools)).toBe(true);
    const toolNames = result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('mostly_list_tasks');
    expect(toolNames).toContain('mostly_create_task');
    expect(toolNames).toContain('mostly_get_task');
  });

  it('creates a task via MCP tool', async () => {
    const result = await mcp.send('tools/call', {
      name: 'mostly_create_task',
      arguments: {
        title: 'MCP created task',
        type: 'feature',
        project_id: projectId,
      },
    });
    expect(result.content).toBeDefined();
    const text = result.content[0].text;
    const data = JSON.parse(text);
    expect(data.data.title).toBe('MCP created task');
    expect(data.data.key).toBe('MCP-1');
  });

  it('lists tasks via MCP tool', async () => {
    const result = await mcp.send('tools/call', {
      name: 'mostly_list_tasks',
      arguments: { project_id: projectId },
    });
    const text = result.content[0].text;
    const data = JSON.parse(text);
    expect(data.data.items.length).toBeGreaterThanOrEqual(1);
  });

  it('gets a task via MCP tool', async () => {
    const result = await mcp.send('tools/call', {
      name: 'mostly_get_task',
      arguments: { id: 'MCP-1' },
    });
    const text = result.content[0].text;
    const data = JSON.parse(text);
    expect(data.title).toBe('MCP created task');
  });
});
```

- [ ] **Step 3: Write mcp/resources.test.ts**

Create `e2e/docker/mcp/resources.test.ts`:

```typescript
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { McpTestRunner } from '../setup/mcp-runner.js';
import { client } from '../setup/test-client.js';

describe('MCP resources', () => {
  const mcp = new McpTestRunner();
  const actor = 'e2e-agent';

  beforeAll(async () => {
    // Ensure test data exists (from tools test or create fresh)
    const projects = await client.get('/v0/projects');
    if (!projects.data.items.some((p: any) => p.key === 'MCPR')) {
      await client.post('/v0/projects', {
        key: 'MCPR', name: 'MCP Resource Test', actor_handle: actor,
      });
      await client.post('/v0/tasks', {
        title: 'Resource test task', type: 'feature',
        project_id: (await client.get('/v0/projects')).data.items.find((p: any) => p.key === 'MCPR').id,
        actor_handle: actor,
      });
    }
    await mcp.start();
  });

  afterAll(async () => {
    await mcp.stop();
  });

  it('lists resource templates', async () => {
    const result = await mcp.send('resources/templates/list', {});
    expect(result.resourceTemplates).toBeDefined();
    const uriTemplates = result.resourceTemplates.map((t: any) => t.uriTemplate);
    expect(uriTemplates).toContain('task://{slug}/{key}');
    expect(uriTemplates).toContain('project://{slug}/{key}');
    expect(uriTemplates).toContain('principal://{slug}/{handle}');
  });

  it('reads a task resource', async () => {
    const result = await mcp.send('resources/read', {
      uri: 'task://default/MCPR-1',
    });
    expect(result.contents).toBeDefined();
    expect(result.contents.length).toBe(1);
    const data = JSON.parse(result.contents[0].text);
    expect(data.key).toBe('MCPR-1');
  });

  it('reads a principal resource', async () => {
    const result = await mcp.send('resources/read', {
      uri: 'principal://default/e2e-agent',
    });
    expect(result.contents).toBeDefined();
    const data = JSON.parse(result.contents[0].text);
    expect(data.handle).toBe('e2e-agent');
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add e2e/docker/setup/mcp-runner.ts e2e/docker/mcp/
git commit -m "test(e2e): add MCP server E2E tests"
```

---

### Task 11: Workers/Miniflare E2E tests

**Files:**
- Create: `e2e/docker/workers/d1-api.test.ts`

**Note:** This task requires adding `miniflare` as a dev dependency. The Miniflare programmatic API creates a D1-compatible database binding that we use to test the Hono app through the Cloudflare Workers code path.

- [ ] **Step 1: Add miniflare dependency**

```bash
pnpm add -Dw miniflare
```

- [ ] **Step 2: Write d1-api.test.ts**

Create `e2e/docker/workers/d1-api.test.ts`:

```typescript
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Workers D1 API', () => {
  let mf: Miniflare;
  const TOKEN = 'test-worker-token';
  const WORKSPACE_ID = 'ws_d1test_000001';

  beforeAll(async () => {
    // Read the bundled worker script (built by build:worker)
    const workerPath = resolve(__dirname, '../../../packages/server/dist/worker.js');

    mf = new Miniflare({
      modules: true,
      scriptPath: workerPath,
      d1Databases: ['DB'],
      bindings: {
        MOSTLY_TOKEN: TOKEN,
        WORKSPACE_ID: WORKSPACE_ID,
      },
      compatibilityDate: '2024-12-01',
      compatibilityFlags: ['nodejs_compat'],
    });

    // Apply migrations to D1
    const db = await mf.getD1Database('DB');
    const migrationSql = readFileSync(
      resolve(__dirname, '../../../packages/db/migrations/0000_brief_toxin.sql'),
      'utf-8'
    );
    // Split on the drizzle statement breakpoint marker
    const statements = migrationSql
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    for (const stmt of statements) {
      await db.exec(stmt);
    }

    // Seed workspace
    const now = new Date().toISOString();
    await db.exec(`INSERT INTO workspace (id, slug, name, created_at, updated_at) VALUES ('${WORKSPACE_ID}', 'default', 'D1 Test', '${now}', '${now}')`);

    // Seed bootstrap principal
    await db.exec(`INSERT INTO principal (id, workspace_id, handle, kind, display_name, metadata_json, is_active, created_at, updated_at) VALUES ('prin_d1test_000001', '${WORKSPACE_ID}', 'd1-agent', 'agent', 'D1 Agent', NULL, 1, '${now}', '${now}')`);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  function headers(): HeadersInit {
    return {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    };
  }

  it('healthcheck works through Workers', async () => {
    const res = await mf.dispatchFetch('http://localhost/healthz');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
  });

  it('lists principals', async () => {
    const res = await mf.dispatchFetch('http://localhost/v0/principals', {
      headers: headers(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(body.data.items.some((p: any) => p.handle === 'd1-agent')).toBe(true);
  });

  it('creates a project', async () => {
    const res = await mf.dispatchFetch('http://localhost/v0/projects', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        key: 'D1',
        name: 'D1 Test Project',
        actor_handle: 'd1-agent',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.key).toBe('D1');
  });

  it('creates a task', async () => {
    const projRes = await mf.dispatchFetch('http://localhost/v0/projects', {
      headers: headers(),
    });
    const projects = (await projRes.json() as any).data.items;
    const projectId = projects.find((p: any) => p.key === 'D1').id;

    const res = await mf.dispatchFetch('http://localhost/v0/tasks', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        title: 'D1 task',
        type: 'feature',
        project_id: projectId,
        actor_handle: 'd1-agent',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.key).toBe('D1-1');
    expect(body.data.status).toBe('open');
  });

  it('claims and transitions a task', async () => {
    const getRes = await mf.dispatchFetch('http://localhost/v0/tasks/D1-1', {
      headers: headers(),
    });
    const task = (await getRes.json() as any).data;

    // Claim
    const claimRes = await mf.dispatchFetch(`http://localhost/v0/tasks/${task.id}/claim`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        expected_version: task.version,
        actor_handle: 'd1-agent',
      }),
    });
    expect(claimRes.status).toBe(200);
    const claimed = (await claimRes.json() as any).data;
    expect(claimed.status).toBe('claimed');

    // Transition to in_progress
    const startRes = await mf.dispatchFetch(`http://localhost/v0/tasks/${task.id}/transition`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        to_status: 'in_progress',
        expected_version: claimed.version,
        actor_handle: 'd1-agent',
      }),
    });
    expect(startRes.status).toBe(200);
    const started = (await startRes.json() as any).data;
    expect(started.status).toBe('in_progress');
  });

  it('adds and lists task updates', async () => {
    const getRes = await mf.dispatchFetch('http://localhost/v0/tasks/D1-1', {
      headers: headers(),
    });
    const task = (await getRes.json() as any).data;

    const updateRes = await mf.dispatchFetch(`http://localhost/v0/tasks/${task.id}/updates`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        kind: 'note',
        body: 'D1 test note',
        actor_handle: 'd1-agent',
      }),
    });
    expect(updateRes.status).toBe(200);

    const listRes = await mf.dispatchFetch(`http://localhost/v0/tasks/${task.id}/updates`, {
      headers: headers(),
    });
    expect(listRes.status).toBe(200);
    const updates = (await listRes.json() as any).data;
    expect(updates.items.some((u: any) => u.body === 'D1 test note')).toBe(true);
  });
});
```

- [ ] **Step 3: Ensure worker is built**

The `d1-api.test.ts` requires the bundled worker at `packages/server/dist/worker.js`. This is produced by `pnpm --filter @mostly/server build:worker`. Make sure the Dockerfile.test build step includes this:

Add to `Dockerfile.test` after `RUN pnpm build`:

```dockerfile
RUN pnpm --filter @mostly/server build:worker
```

- [ ] **Step 4: Commit**

```bash
git add e2e/docker/workers/d1-api.test.ts Dockerfile.test package.json pnpm-lock.yaml
git commit -m "test(e2e): add Workers/D1 Miniflare E2E tests"
```

---

### Task 12: npm scripts and GitHub Actions

**Files:**
- Modify: `package.json:3-10`
- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Add npm scripts to root package.json**

Add these scripts to the root `package.json`:

```json
{
  "scripts": {
    "build": "pnpm -r run build",
    "test": "pnpm -r --if-present run test",
    "test:e2e": "vitest run --config e2e/vitest.config.ts",
    "test:e2e:docker": "docker compose -f docker-compose.e2e.yml up --build --exit-code-from test-runner",
    "test:e2e:docker:build": "docker compose -f docker-compose.e2e.yml build",
    "test:e2e:docker:logs": "docker compose -f docker-compose.e2e.yml logs server",
    "test:e2e:docker:down": "docker compose -f docker-compose.e2e.yml down -v",
    "lint": "pnpm -r --if-present run lint",
    "clean": "pnpm -r --if-present run clean"
  }
}
```

- [ ] **Step 2: Create GitHub Actions workflow**

Create `.github/workflows/e2e.yml`:

```yaml
name: Tests

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
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test

  e2e-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test:e2e

  e2e-docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f docker-compose.e2e.yml up --build --exit-code-from test-runner
      - name: Server logs on failure
        if: failure()
        run: docker compose -f docker-compose.e2e.yml logs server
      - name: Upload server logs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-server-logs
          path: /tmp/mostly-e2e-*.log
          retention-days: 7
```

- [ ] **Step 3: Commit**

```bash
git add package.json .github/workflows/e2e.yml
git commit -m "ci: add E2E Docker npm scripts and GitHub Actions workflow"
```

---

### Task 13: End-to-end validation

- [ ] **Step 1: Build and run the full Docker E2E suite locally**

```bash
pnpm test:e2e:docker
```

Expected: Docker builds both images, starts server container, waits for health check, starts test runner, runs all E2E tests, exits with code 0.

- [ ] **Step 2: Fix any failures**

If any tests fail:
1. Check server logs: `pnpm test:e2e:docker:logs`
2. Fix the issue in the test or source code
3. Re-run: `pnpm test:e2e:docker`

- [ ] **Step 3: Verify existing tests still pass**

```bash
pnpm test
pnpm test:e2e
```

Expected: All existing unit tests and in-memory E2E smoke test still pass.

- [ ] **Step 4: Clean up**

```bash
pnpm test:e2e:docker:down
```

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: E2E test adjustments from validation run"
```
