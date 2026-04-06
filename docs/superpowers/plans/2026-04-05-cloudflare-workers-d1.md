# Cloudflare Workers + D1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the Mostly HTTP API on Cloudflare Workers with D1 as the SQLite backend, while keeping the existing local-first Node.js path working.

**Architecture:** Refactor `@mostly/db` to use a common `MostlyDb` type that abstracts over both better-sqlite3 (sync) and D1 (async). Add `await` to all repository DB calls. Add a D1 adapter and D1 transaction manager. Add a Workers entry point to `@mostly/server`. Write deployment docs.

**Tech Stack:** Drizzle ORM (d1 driver), Cloudflare Workers, Cloudflare D1, wrangler, tsup

**Spec:** `docs/superpowers/specs/2026-04-05-cloudflare-workers-d1-design.md`

---

## File Structure

### New Files
- `packages/db/src/types.ts` — `MostlyDb` type alias
- `packages/db/src/adapters/d1.ts` — D1 adapter factory
- `packages/db/src/repositories/d1-transaction.ts` — D1 transaction manager
- `packages/server/src/worker.ts` — Cloudflare Workers entry point
- `wrangler.toml` — Wrangler configuration (project root)
- `docs/cloudflare-deployment.md` — Deployment guide

### Modified Files
- `packages/db/src/adapters/local-sqlite.ts` — Return `MostlyDb` type
- `packages/db/src/adapters/index.ts` — Export D1 adapter
- `packages/db/src/migrate.ts` — Accept `MostlyDb` type
- `packages/db/src/repositories/workspace.ts` — `MostlyDb` type + `await`
- `packages/db/src/repositories/principal.ts` — `MostlyDb` type + `await`
- `packages/db/src/repositories/project.ts` — `MostlyDb` type + `await`
- `packages/db/src/repositories/task.ts` — `MostlyDb` type + `await`
- `packages/db/src/repositories/task-update.ts` — `MostlyDb` type + `await`
- `packages/db/src/repositories/transaction.ts` — Rename class, use `MostlyDb` type
- `packages/db/src/repositories/index.ts` — Use `MostlyDb` type, export D1 transaction manager
- `packages/db/src/index.ts` — Export types
- `packages/db/package.json` — Add `drizzle-orm` D1 types (already included in drizzle-orm)
- `packages/server/package.json` — Add `build:worker` script, tsup worker config
- `packages/server/src/index.ts` — Export worker entry point

---

### Task 1: Add MostlyDb type alias

**Files:**
- Create: `packages/db/src/types.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Create the type file**

```typescript
// packages/db/src/types.ts
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema/index.js';

/**
 * Unified database type for both better-sqlite3 and D1.
 * BetterSQLite3Database is 'sync', DrizzleD1Database is 'async'.
 * Using 'async' as the base so all queries must be awaited.
 * Safe for better-sqlite3 because `await syncValue === syncValue`.
 */
export type MostlyDb = BaseSQLiteDatabase<'async', any, typeof schema>;
```

- [ ] **Step 2: Export from index**

Add to `packages/db/src/index.ts`:

```typescript
export type { MostlyDb } from './types.js';
```

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @mostly/db build`
Expected: Build succeeds, `MostlyDb` type available in dist.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/types.ts packages/db/src/index.ts
git commit -m "feat(db): add MostlyDb unified type alias for sync/async SQLite"
```

---

### Task 2: Update local-sqlite adapter to return MostlyDb

**Files:**
- Modify: `packages/db/src/adapters/local-sqlite.ts`

- [ ] **Step 1: Update adapter return types**

Replace the full contents of `packages/db/src/adapters/local-sqlite.ts`:

```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema/index';
import type { MostlyDb } from '../types.js';

export function createLocalDb(path: string): MostlyDb {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema }) as unknown as MostlyDb;
}

export function createInMemoryDb(): MostlyDb {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema }) as unknown as MostlyDb;
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @mostly/db build`
Expected: Build succeeds.

- [ ] **Step 3: Run existing tests**

Run: `pnpm --filter @mostly/db test`
Expected: All 80 tests pass. The `as unknown as MostlyDb` cast is safe at runtime.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/adapters/local-sqlite.ts
git commit -m "refactor(db): return MostlyDb from local-sqlite adapters"
```

---

### Task 3: Update migrate.ts to accept MostlyDb

**Files:**
- Modify: `packages/db/src/migrate.ts`

- [ ] **Step 1: Update function signature**

Replace the full contents of `packages/db/src/migrate.ts`:

```typescript
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export function runMigrations(db: BetterSQLite3Database<any>, migrationsFolder: string) {
  migrate(db, { migrationsFolder });
}
```

Note: `runMigrations` stays typed to `BetterSQLite3Database` because the Drizzle migrator is driver-specific. The better-sqlite3 migrator only works with better-sqlite3 instances. D1 migrations use `wrangler d1 migrations apply` instead. This function is only called in the Node.js code path (serve.ts, CLI, tests).

No changes needed here — keep as-is. The callers will need to pass the raw better-sqlite3 drizzle instance before the MostlyDb cast, or we accept that this function is Node-only.

Actually, since the local adapter now returns `MostlyDb`, callers can't pass it to `runMigrations()` without a type error. We need to either:
(a) Make `runMigrations` accept `any`, or
(b) Have the local adapter export both the typed and untyped versions.

The simplest fix: accept `any` since this is an internal bootstrapping function.

```typescript
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export function runMigrations(db: any, migrationsFolder: string) {
  migrate(db, { migrationsFolder });
}
```

- [ ] **Step 2: Build and test**

Run: `pnpm --filter @mostly/db build && pnpm --filter @mostly/db test`
Expected: Build succeeds, all 80 tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/migrate.ts
git commit -m "refactor(db): accept any db type in runMigrations (Node-only function)"
```

---

### Task 4: Refactor all repositories to use MostlyDb + await

This is the largest task. All 5 repository classes need two changes:
1. Constructor type: `BetterSQLite3Database<typeof schema>` -> `MostlyDb`
2. All `.all()` and `.run()` calls gain `await`

**Files:**
- Modify: `packages/db/src/repositories/workspace.ts`
- Modify: `packages/db/src/repositories/principal.ts`
- Modify: `packages/db/src/repositories/project.ts`
- Modify: `packages/db/src/repositories/task.ts`
- Modify: `packages/db/src/repositories/task-update.ts`

- [ ] **Step 1: Update workspace repository**

In `packages/db/src/repositories/workspace.ts`:

Change import from:
```typescript
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
```
to:
```typescript
import type { MostlyDb } from '../types.js';
```

Change constructor from:
```typescript
constructor(private db: BetterSQLite3Database<typeof schema>) {}
```
to:
```typescript
constructor(private db: MostlyDb) {}
```

Remove the `import type * as schema from '../schema/index.js';` line (no longer needed for the type parameter).

Add `await` to all DB calls. Every `.all()` and `.run()` call:
- `findById`: `const rows = await this.db.select()...all();`
- `findBySlug`: `const rows = await this.db.select()...all();`
- `getDefault`: `const rows = await this.db.select()...all();`
- `create`: `await this.db.insert(workspaces).values({...}).run();`

- [ ] **Step 2: Update principal repository**

In `packages/db/src/repositories/principal.ts`:

Same pattern — change import to `MostlyDb`, update constructor, add `await` to all `.all()` and `.run()` calls:
- `findById`: `await ...all()`
- `findByHandle`: `await ...all()`
- `list`: `await ...all()`
- `create`: `await ...run()`
- `update`: `await ...run()`, `await ...all()` (for the re-read)

- [ ] **Step 3: Update project repository**

In `packages/db/src/repositories/project.ts`:

Same pattern — change import to `MostlyDb`, update constructor, add `await` to all `.all()` and `.run()` calls.

- [ ] **Step 4: Update task repository**

In `packages/db/src/repositories/task.ts`:

Same pattern. Special attention to:
- `nextKeyNumber`: `const rows = await this.db.all<{ next_number: number }>(sql\`...\`);`
- `create`: `await this.db.insert(tasks).values({...}).run();`
- `update`: `const result = await this.db.update(tasks).set(updateValues)...run();`
- `findWithExpiredClaims`: `const rows = await this.db.select()...all();`

- [ ] **Step 5: Update task-update repository**

In `packages/db/src/repositories/task-update.ts`:

Same pattern — change import to `MostlyDb`, update constructor, add `await` to all `.all()` and `.run()` calls.

- [ ] **Step 6: Run all tests**

Run: `pnpm --filter @mostly/db test`
Expected: All 80 tests pass. `await` on synchronous values is a no-op.

Run: `pnpm --filter @mostly/server test`
Expected: All 69 tests pass.

Run: `pnpm test:e2e`
Expected: 1 test passes.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/repositories/workspace.ts packages/db/src/repositories/principal.ts packages/db/src/repositories/project.ts packages/db/src/repositories/task.ts packages/db/src/repositories/task-update.ts
git commit -m "refactor(db): use MostlyDb type and await all DB calls in repositories"
```

---

### Task 5: Refactor transaction manager and repository index

**Files:**
- Modify: `packages/db/src/repositories/transaction.ts`
- Modify: `packages/db/src/repositories/index.ts`

- [ ] **Step 1: Rename and update transaction manager**

Replace the full contents of `packages/db/src/repositories/transaction.ts`:

```typescript
import { sql } from 'drizzle-orm';
import type { TransactionManager, TransactionContext } from '@mostly/core';
import type { MostlyDb } from '../types.js';
import { DrizzleWorkspaceRepository } from './workspace.js';
import { DrizzlePrincipalRepository } from './principal.js';
import { DrizzleProjectRepository } from './project.js';
import { DrizzleTaskRepository } from './task.js';
import { DrizzleTaskUpdateRepository } from './task-update.js';

export class DrizzleLocalTransactionManager implements TransactionManager {
  constructor(private db: MostlyDb) {}

  async withTransaction<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    await this.db.run(sql.raw('BEGIN'));
    const ctx: TransactionContext = {
      tasks: new DrizzleTaskRepository(this.db),
      taskUpdates: new DrizzleTaskUpdateRepository(this.db),
      projects: new DrizzleProjectRepository(this.db),
      principals: new DrizzlePrincipalRepository(this.db),
      workspaces: new DrizzleWorkspaceRepository(this.db),
    };
    try {
      const result = await fn(ctx);
      await this.db.run(sql.raw('COMMIT'));
      return result;
    } catch (err) {
      await this.db.run(sql.raw('ROLLBACK'));
      throw err;
    }
  }
}
```

- [ ] **Step 2: Update repository index**

Replace the full contents of `packages/db/src/repositories/index.ts`:

```typescript
export { DrizzleWorkspaceRepository } from './workspace.js';
export { DrizzlePrincipalRepository } from './principal.js';
export { DrizzleProjectRepository } from './project.js';
export { DrizzleTaskRepository } from './task.js';
export { DrizzleTaskUpdateRepository } from './task-update.js';
export { DrizzleLocalTransactionManager } from './transaction.js';

import type { MostlyDb } from '../types.js';
import type { TransactionManager } from '@mostly/core';
import { DrizzleWorkspaceRepository } from './workspace.js';
import { DrizzlePrincipalRepository } from './principal.js';
import { DrizzleProjectRepository } from './project.js';
import { DrizzleTaskRepository } from './task.js';
import { DrizzleTaskUpdateRepository } from './task-update.js';
import { DrizzleLocalTransactionManager } from './transaction.js';

export function createRepositories(db: MostlyDb) {
  return {
    workspaces: new DrizzleWorkspaceRepository(db),
    principals: new DrizzlePrincipalRepository(db),
    projects: new DrizzleProjectRepository(db),
    tasks: new DrizzleTaskRepository(db),
    taskUpdates: new DrizzleTaskUpdateRepository(db),
  };
}

export function createTransactionManager(db: MostlyDb): TransactionManager {
  return new DrizzleLocalTransactionManager(db);
}
```

- [ ] **Step 3: Update callers that reference DrizzleTransactionManager by name**

Search for `DrizzleTransactionManager` in imports. If any test or file imports it by name, update to `DrizzleLocalTransactionManager`.

- [ ] **Step 4: Run all tests**

Run: `pnpm --filter @mostly/db test && pnpm --filter @mostly/server test && pnpm test:e2e`
Expected: All tests pass (80 + 69 + 1 = 150).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/transaction.ts packages/db/src/repositories/index.ts
git commit -m "refactor(db): rename to DrizzleLocalTransactionManager, use MostlyDb type"
```

---

### Task 6: Add D1 adapter and D1 transaction manager

**Files:**
- Create: `packages/db/src/adapters/d1.ts`
- Create: `packages/db/src/repositories/d1-transaction.ts`
- Modify: `packages/db/src/adapters/index.ts`
- Modify: `packages/db/src/repositories/index.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Create D1 adapter**

Create `packages/db/src/adapters/d1.ts`:

```typescript
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../schema/index.js';
import type { MostlyDb } from '../types.js';

export function createD1Db(d1: D1Database): MostlyDb {
  return drizzle(d1, { schema }) as unknown as MostlyDb;
}
```

- [ ] **Step 2: Create D1 transaction manager**

Create `packages/db/src/repositories/d1-transaction.ts`:

```typescript
import type { TransactionManager, TransactionContext } from '@mostly/core';
import type { MostlyDb } from '../types.js';
import { DrizzleWorkspaceRepository } from './workspace.js';
import { DrizzlePrincipalRepository } from './principal.js';
import { DrizzleProjectRepository } from './project.js';
import { DrizzleTaskRepository } from './task.js';
import { DrizzleTaskUpdateRepository } from './task-update.js';

/**
 * D1 transaction manager. D1 does not support multi-statement transactions
 * (BEGIN/COMMIT/ROLLBACK). Operations run sequentially. D1's single-writer
 * guarantee prevents concurrent conflicts at the database level.
 * Single-statement atomicity (e.g. INSERT...RETURNING in nextKeyNumber) is preserved.
 */
export class DrizzleD1TransactionManager implements TransactionManager {
  constructor(private db: MostlyDb) {}

  async withTransaction<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    const ctx: TransactionContext = {
      tasks: new DrizzleTaskRepository(this.db),
      taskUpdates: new DrizzleTaskUpdateRepository(this.db),
      projects: new DrizzleProjectRepository(this.db),
      principals: new DrizzlePrincipalRepository(this.db),
      workspaces: new DrizzleWorkspaceRepository(this.db),
    };
    return fn(ctx);
  }
}
```

- [ ] **Step 3: Export D1 adapter from adapters barrel**

Replace `packages/db/src/adapters/index.ts`:

```typescript
export { createLocalDb, createInMemoryDb } from './local-sqlite.js';
export { createD1Db } from './d1.js';
```

- [ ] **Step 4: Export D1 transaction manager from repositories barrel**

Add to `packages/db/src/repositories/index.ts` exports:

```typescript
export { DrizzleD1TransactionManager } from './d1-transaction.js';
```

Add the factory function:

```typescript
import { DrizzleD1TransactionManager } from './d1-transaction.js';

export function createD1TransactionManager(db: MostlyDb): TransactionManager {
  return new DrizzleD1TransactionManager(db);
}
```

- [ ] **Step 5: Export from package index**

Ensure `packages/db/src/index.ts` exports everything (it already re-exports `./adapters/index` and `./repositories/index.js`, so the new exports flow through automatically). Verify the type export is present:

```typescript
export type { MostlyDb } from './types.js';
export * from './schema/index';
export * from './adapters/index';
export { runMigrations } from './migrate';
export * from './repositories/index.js';
```

- [ ] **Step 6: Build**

Run: `pnpm --filter @mostly/db build`
Expected: Build succeeds. D1Database type may show as unresolved — that's fine, it's a Cloudflare Workers global type only available in the Workers runtime. The build output is still valid ESM.

- [ ] **Step 7: Run existing tests**

Run: `pnpm --filter @mostly/db test && pnpm --filter @mostly/server test && pnpm test:e2e`
Expected: All tests pass. D1 code is not exercised by existing tests.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/adapters/d1.ts packages/db/src/repositories/d1-transaction.ts packages/db/src/adapters/index.ts packages/db/src/repositories/index.ts packages/db/src/index.ts
git commit -m "feat(db): add D1 adapter and D1 transaction manager"
```

---

### Task 7: Add Cloudflare Workers entry point

**Files:**
- Create: `packages/server/src/worker.ts`
- Modify: `packages/server/package.json`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Create worker entry point**

Create `packages/server/src/worker.ts`:

```typescript
import { createD1Db, createRepositories, createD1TransactionManager } from '@mostly/db';
import { PrincipalService, ProjectService, TaskService, MaintenanceService } from '@mostly/core';
import { createApp } from './app.js';

interface Env {
  DB: D1Database;
  MOSTLY_TOKEN: string;
  WORKSPACE_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = createD1Db(env.DB);
    const repos = createRepositories(db);
    const tx = createD1TransactionManager(db);

    const principalService = new PrincipalService(repos.principals);
    const projectService = new ProjectService(repos.projects);
    const taskService = new TaskService(repos.tasks, repos.taskUpdates, repos.projects, tx);
    const maintenanceService = new MaintenanceService(repos.tasks, repos.taskUpdates, tx);

    const app = createApp({
      workspaceId: env.WORKSPACE_ID,
      token: env.MOSTLY_TOKEN,
      principalService,
      projectService,
      taskService,
      maintenanceService,
    });

    return app.fetch(request, env);
  },
};
```

- [ ] **Step 2: Add worker build script to package.json**

In `packages/server/package.json`, add to scripts:

```json
"build:worker": "tsup src/worker.ts --format esm --target es2022 --platform browser --no-dts --no-sourcemap --out-dir dist --no-external"
```

Note: `--no-external` bundles all dependencies into a single file for Workers. `--platform browser` targets the Workers runtime (not Node.js).

- [ ] **Step 3: Export worker from index**

Add to `packages/server/src/index.ts`:

```typescript
export { default as worker } from './worker.js';
```

Also add `src/worker.ts` to the tsup entry array in package.json:

```json
"tsup": {
  "entry": ["src/index.ts", "src/serve.ts", "src/worker.ts"],
  "format": ["esm"],
  "dts": true,
  "clean": true,
  "sourcemap": true
}
```

- [ ] **Step 4: Build**

Run: `pnpm --filter @mostly/server build`
Expected: Build succeeds. `dist/worker.js` is created.

- [ ] **Step 5: Build worker bundle**

Run: `pnpm --filter @mostly/server build:worker`
Expected: A single bundled `dist/worker.js` file is created with all dependencies inlined.

- [ ] **Step 6: Run existing tests**

Run: `pnpm --filter @mostly/server test && pnpm test:e2e`
Expected: All tests pass. Worker code isn't exercised by existing tests.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/worker.ts packages/server/package.json packages/server/src/index.ts
git commit -m "feat(server): add Cloudflare Workers entry point"
```

---

### Task 8: Add wrangler.toml

**Files:**
- Create: `wrangler.toml` (project root)

- [ ] **Step 1: Create wrangler.toml**

Create `wrangler.toml` in the project root:

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

- [ ] **Step 2: Add to .gitignore**

Add to `.gitignore` if not already present:

```
.wrangler/
```

- [ ] **Step 3: Commit**

```bash
git add wrangler.toml .gitignore
git commit -m "feat: add wrangler.toml for Cloudflare Workers deployment"
```

---

### Task 9: Write Cloudflare deployment guide

**Files:**
- Create: `docs/cloudflare-deployment.md`

- [ ] **Step 1: Write the deployment guide**

Create `docs/cloudflare-deployment.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/cloudflare-deployment.md
git commit -m "docs: add Cloudflare Workers + D1 deployment guide"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full build**

Run: `pnpm build`
Expected: All packages build successfully.

- [ ] **Step 2: Full test suite**

Run: `pnpm -r --if-present --filter '!@mostly/mcp' run test && pnpm test:e2e`
Expected: All 326 tests pass (types: 31, core: 118, db: 80, server: 69, cli: 27, e2e: 1).

- [ ] **Step 3: Worker bundle build**

Run: `pnpm --filter @mostly/server build:worker`
Expected: `packages/server/dist/worker.js` is created as a single bundled file.

- [ ] **Step 4: Verify wrangler config**

Run: `wrangler deploy --dry-run`
Expected: Wrangler validates the config and reports the worker would be deployed (without actually deploying).

- [ ] **Step 5: Commit any remaining changes**

If any fixups were needed, commit them.
