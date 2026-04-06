# Mostly: Cloudflare Workers + D1 Deployment Design

**Date**: 2026-04-05
**Status**: Draft
**Goal**: Run the Mostly HTTP API on Cloudflare Workers with D1 as the SQLite backend, while keeping the local-first Node.js path working.

## Context

Mostly is currently a local-first task tracker using better-sqlite3. The architecture is well-layered: core business logic and routes are platform-agnostic, while the DB adapter and server bootstrap are Node-specific. This design adds Cloudflare Workers + D1 as a deployment target by refactoring the DB package to support both backends through a shared type.

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                  @mostly/server                   │
│  createApp() / middleware / routes (unchanged)    │
├──────────────┬───────────────────────────────────┤
│  serve.ts    │  worker.ts                        │
│  (Node.js)   │  (Cloudflare Workers)             │
├──────────────┴───────────────────────────────────┤
│                  @mostly/core                     │
│  Services / State Machine / Claims (unchanged)    │
├──────────────────────────────────────────────────┤
│                   @mostly/db                      │
│  Shared repos + schema (await-based)              │
├──────────────┬───────────────────────────────────┤
│  local-sqlite│  d1 adapter                       │
│  adapter     │  + D1TransactionManager            │
│  + LocalTx   │                                   │
└──────────────┴───────────────────────────────────┘
```

## DB Package Refactor

### Common Database Type

Define a unified type that both better-sqlite3 and D1 instances conform to:

```typescript
// packages/db/src/types.ts
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema/index.js';

export type MostlyDb = BaseSQLiteDatabase<'async', any, typeof schema>;
```

- `BetterSQLite3Database` extends `BaseSQLiteDatabase<'sync', RunResult, TSchema>`
- `DrizzleD1Database` extends `BaseSQLiteDatabase<'async', D1Result, TSchema>`
- Cast the better-sqlite3 instance to `MostlyDb` — safe because `await syncValue === syncValue` at runtime
- All repository constructors accept `MostlyDb` instead of `BetterSQLite3Database<typeof schema>`

### Adapter Changes

**`adapters/local-sqlite.ts`** (modified):
```typescript
import type { MostlyDb } from '../types.js';

export function createLocalDb(path: string): MostlyDb {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema }) as unknown as MostlyDb;
}
```

**`adapters/d1.ts`** (new):
```typescript
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../schema/index.js';
import type { MostlyDb } from '../types.js';

export function createD1Db(d1: D1Database): MostlyDb {
  return drizzle(d1, { schema }) as unknown as MostlyDb;
}
```

### Repository Changes

All 5 repository classes change their constructor from:
```typescript
constructor(private db: BetterSQLite3Database<typeof schema>) {}
```
to:
```typescript
constructor(private db: MostlyDb) {}
```

All `.all()` and `.run()` calls gain `await`:
```typescript
// Before (sync)
const rows = this.db.select().from(tasks).where(eq(tasks.id, id)).all();

// After (works for both)
const rows = await this.db.select().from(tasks).where(eq(tasks.id, id)).all();
```

The `nextKeyNumber` raw SQL call changes from `this.db.all(sql)` to `await this.db.all(sql)`.

### Transaction Manager

**Local (renamed from `DrizzleTransactionManager`)** — `DrizzleLocalTransactionManager`:
Uses raw `BEGIN/COMMIT/ROLLBACK`. Works only for single-connection SQLite (better-sqlite3). Unchanged logic, just uses `MostlyDb` type.

**D1 (new)** — `DrizzleD1TransactionManager`:
Uses Drizzle's D1 transaction support. D1 supports batch operations via `db.batch()`:

```typescript
export class DrizzleD1TransactionManager implements TransactionManager {
  constructor(private db: MostlyDb) {}

  async withTransaction<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    // D1 transactions work through the Drizzle transaction API
    // Fallback: if D1 transaction not available, operations run sequentially
    // (D1 is single-writer per database, so this is safe for most operations)
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

Note: D1 does not support multi-statement transactions in the traditional sense. It supports `batch()` for atomic multi-statement execution, but that requires knowing all statements upfront. For our use case (sequential async operations), operations run sequentially. D1's single-writer guarantee prevents concurrent conflicts at the database level. The `nextKeyNumber` atomic INSERT...RETURNING remains safe as a single statement.

### Factory Functions

```typescript
// packages/db/src/repositories/index.ts
export function createRepositories(db: MostlyDb) { ... }
export function createLocalTransactionManager(db: MostlyDb): TransactionManager { ... }
export function createD1TransactionManager(db: MostlyDb): TransactionManager { ... }
```

### Migrations

The same `.sql` migration files work for both backends:
- **Local**: `runMigrations(db, migrationsDir)` at server startup (existing)
- **D1**: `wrangler d1 migrations apply mostly-db --local` or `--remote` (CLI-driven)

The D1 migrations directory is configured in `wrangler.toml` to point at `packages/db/migrations`.

## Worker Entry Point

New file: `packages/server/src/worker.ts`

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

Services are constructed per-request. This is standard for Workers — they're lightweight objects and D1 connections are per-request by nature.

## Build Configuration

### wrangler.toml

```toml
name = "mostly"
main = "dist/worker.js"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "mostly-db"
database_id = "" # filled after wrangler d1 create

[vars]
WORKSPACE_ID = "" # filled after seeding
```

### tsup config for worker bundle

The worker entry point needs a separate tsup build that bundles everything into a single file for Workers:

```typescript
// packages/server/tsup.worker.config.ts
export default {
  entry: ['src/worker.ts'],
  format: ['esm'],
  target: 'es2022',
  platform: 'browser', // Workers runtime
  outDir: 'dist',
  noExternal: [/.*/], // Bundle all dependencies
  external: ['cloudflare:*'],
};
```

## Deployment Instructions

Written to `docs/cloudflare-deployment.md` as a standalone guide covering:

1. **Prerequisites**: Cloudflare account, `wrangler` CLI, `pnpm`
2. **Create D1 database**: `wrangler d1 create mostly-db`
3. **Configure wrangler.toml**: Set `database_id` from step 2
4. **Apply migrations**: `wrangler d1 migrations apply mostly-db --remote`
5. **Seed workspace**: `wrangler d1 execute mostly-db --remote --command "INSERT INTO workspace ..."`
6. **Seed principal**: Same pattern for the first user/agent
7. **Set secrets**: `wrangler secret put MOSTLY_TOKEN`
8. **Set workspace ID**: Update `WORKSPACE_ID` in wrangler.toml
9. **Build**: `pnpm build && pnpm --filter @mostly/server build:worker`
10. **Deploy**: `wrangler deploy`
11. **Verify**: `curl` test against the deployed URL
12. **MCP configuration**: Point `@mostly/mcp` at the Worker URL

## What Changes vs What Stays

| Component | Changes? | Details |
|-----------|----------|---------|
| `@mostly/types` | No | Pure types, fully portable |
| `@mostly/core` | No | Services use async interfaces |
| `@mostly/db` schema | No | Drizzle SQLite schema is portable |
| `@mostly/db` adapters | Yes | Add `d1.ts`, modify `local-sqlite.ts` return type |
| `@mostly/db` repositories | Yes | Type change + add `await` to all DB calls |
| `@mostly/db` transactions | Yes | Add `DrizzleD1TransactionManager` |
| `@mostly/db` migrations | No | Same `.sql` files for both |
| `@mostly/server` app | No | `createApp()` unchanged |
| `@mostly/server` routes | No | All use injected services |
| `@mostly/server` middleware | No | Standard Hono patterns |
| `@mostly/server` serve.ts | No | Node entry point stays as-is |
| `@mostly/server` worker.ts | New | Workers entry point |
| `@mostly/cli` | No | Still uses local server |
| `@mostly/mcp` | No | Points at configured URL |

## Testing Strategy

1. **Existing tests continue to pass** — repositories are tested against in-memory better-sqlite3, which now goes through the `MostlyDb` type. The `await` additions are harmless on sync.
2. **D1 adapter tested via Miniflare** — the D1 adapter can be tested locally using Miniflare's D1 implementation in a separate test file.
3. **E2E smoke test unchanged** — uses in-memory DB via `createInMemoryDb()`.
4. **Manual deployment test** — `wrangler dev` for local Workers development with D1.
