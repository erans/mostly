# Typed Short IDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 26-character ULIDs with short, typed IDs (e.g., `tsk_k2pn5jw8`) across all entities — shorter, self-documenting, easy to reference.

**Architecture:** Add `generateId(prefix)` to `@mostly/types` using `crypto.getRandomValues` + Crockford Base32. Replace all `ulid()` calls in services, factories, and seed code. Switch cursor pagination from ID-ordered to `created_at`-ordered. Remove `ulid` dependency.

**Tech Stack:** `crypto.getRandomValues` (built-in, works in Node.js + Workers), Crockford Base32

**Spec:** `docs/superpowers/specs/2026-04-05-typed-short-ids-design.md`

---

## File Structure

### New Files
- `packages/types/src/ids.ts` — `generateId()`, `parseIdPrefix()`, prefix constants, Crockford Base32 alphabet

### Modified Files
- `packages/types/src/index.ts` — re-export `ids.ts`
- `packages/types/__tests__/ids.test.ts` — tests for ID generation and parsing
- `packages/core/src/services/task.ts` — replace `ulid()` with `generateId()`
- `packages/core/src/services/principal.ts` — replace `ulid()` with `generateId()`
- `packages/core/src/services/project.ts` — replace `ulid()` with `generateId()`
- `packages/core/src/services/maintenance.ts` — replace `ulid()` with `generateId()`
- `packages/core/src/test-utils/factories.ts` — replace `ulid()` with `generateId()`
- `packages/core/package.json` — remove `ulid` dependency
- `packages/db/src/repositories/task.ts` — `created_at`-based pagination
- `packages/db/src/repositories/principal.ts` — `created_at`-based pagination
- `packages/db/src/repositories/project.ts` — `created_at`-based pagination
- `packages/db/__tests__/task-repo.test.ts` — update pagination tests
- `packages/db/__tests__/principal-repo.test.ts` — update pagination tests
- `packages/db/__tests__/project-repo.test.ts` — update pagination tests
- `packages/server/src/serve.ts` — replace `ulid()` with `generateId()`
- `packages/cli/src/commands/init.ts` — replace `ulid()` with `generateId()`
- `packages/cli/src/commands/serve.ts` — replace `ulid()` with `generateId()`
- `packages/cli/package.json` — remove `ulid` dependency
- `packages/server/package.json` — remove `ulid` dependency (if present)
- `packages/types/package.json` — remove `ulid` dependency

---

### Task 1: Add `generateId` and `parseIdPrefix` to @mostly/types

**Files:**
- Create: `packages/types/src/ids.ts`
- Create: `packages/types/__tests__/ids.test.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Write the tests**

Create `packages/types/__tests__/ids.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateId, parseIdPrefix, ID_PREFIXES } from '../src/ids.js';

describe('generateId', () => {
  it('produces an ID with the given prefix', () => {
    const id = generateId('tsk');
    expect(id.startsWith('tsk_')).toBe(true);
  });

  it('random part is 8 characters of Crockford Base32', () => {
    const id = generateId('ws');
    const random = id.slice(id.indexOf('_') + 1);
    expect(random).toHaveLength(8);
    expect(random).toMatch(/^[0-9a-hjkmnp-tv-z]{8}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId('proj')));
    expect(ids.size).toBe(100);
  });

  it('works with all known prefixes', () => {
    for (const prefix of Object.values(ID_PREFIXES)) {
      const id = generateId(prefix);
      expect(id.startsWith(`${prefix}_`)).toBe(true);
    }
  });
});

describe('parseIdPrefix', () => {
  it('extracts prefix from a valid ID', () => {
    expect(parseIdPrefix('tsk_k2pn5jw8')).toBe('tsk');
    expect(parseIdPrefix('proj_x8rb4wc6')).toBe('proj');
    expect(parseIdPrefix('ws_a3kf9x2m')).toBe('ws');
  });

  it('returns null for IDs without underscore', () => {
    expect(parseIdPrefix('nounderscore')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseIdPrefix('')).toBeNull();
  });

  it('returns null for IDs with empty prefix', () => {
    expect(parseIdPrefix('_abc')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/eran/work/mostlylinear/.worktrees/mostly-v0 && pnpm --filter @mostly/types test`
Expected: FAIL — `ids.js` does not exist.

- [ ] **Step 3: Implement `ids.ts`**

Create `packages/types/src/ids.ts`:

```typescript
const CROCKFORD_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export const ID_PREFIXES = {
  workspace: 'ws',
  principal: 'prin',
  project: 'proj',
  task: 'tsk',
  taskUpdate: 'upd',
} as const;

export function generateId(prefix: string): string {
  const bytes = new Uint8Array(5); // 5 bytes = 40 bits
  crypto.getRandomValues(bytes);

  let result = '';
  // Encode 40 bits as 8 base32 characters (5 bits each)
  const combined =
    (bytes[0] << 32) |
    (bytes[1] << 24) |
    (bytes[2] << 16) |
    (bytes[3] << 8) |
    bytes[4];

  // Use BigInt to avoid 32-bit overflow
  let value = BigInt(0);
  for (let i = 0; i < 5; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }

  for (let i = 7; i >= 0; i--) {
    const index = Number((value >> (BigInt(i) * 5n)) & 0x1fn);
    result += CROCKFORD_ALPHABET[index];
  }

  return `${prefix}_${result}`;
}

export function parseIdPrefix(id: string): string | null {
  const idx = id.indexOf('_');
  if (idx <= 0) return null;
  return id.slice(0, idx);
}
```

- [ ] **Step 4: Export from index**

Add to `packages/types/src/index.ts`:

```typescript
export * from './ids.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @mostly/types test`
Expected: All tests pass (31 existing + new id tests).

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/ids.ts packages/types/__tests__/ids.test.ts packages/types/src/index.ts
git commit -m "feat(types): add generateId and parseIdPrefix with Crockford Base32"
```

---

### Task 2: Replace `ulid()` in service layer with `generateId()`

**Files:**
- Modify: `packages/core/src/services/task.ts`
- Modify: `packages/core/src/services/principal.ts`
- Modify: `packages/core/src/services/project.ts`
- Modify: `packages/core/src/services/maintenance.ts`

- [ ] **Step 1: Update task service**

In `packages/core/src/services/task.ts`:

Replace the import:
```typescript
// Remove: import { ulid } from 'ulid';
// Add:
import { generateId, ID_PREFIXES } from '@mostly/types';
```

Replace every `ulid()` call used for task IDs:
- Line 57: `id: ulid()` → `id: generateId(ID_PREFIXES.task)`
Replace every `ulid()` call used for task update IDs:
- Line 260: `id: ulid()` → `id: generateId(ID_PREFIXES.taskUpdate)`
- Line 287: `id: ulid()` → `id: generateId(ID_PREFIXES.taskUpdate)`
- Line 299: `id: ulid()` → `id: generateId(ID_PREFIXES.taskUpdate)`

- [ ] **Step 2: Update principal service**

In `packages/core/src/services/principal.ts`:

Replace the import:
```typescript
// Remove: import { ulid } from 'ulid';
// Add:
import { generateId, ID_PREFIXES } from '@mostly/types';
```

Replace:
- Line 23: `id: ulid()` → `id: generateId(ID_PREFIXES.principal)`

- [ ] **Step 3: Update project service**

In `packages/core/src/services/project.ts`:

Replace the import:
```typescript
// Remove: import { ulid } from 'ulid';
// Add:
import { generateId, ID_PREFIXES } from '@mostly/types';
```

Replace:
- Line 22: `id: ulid()` → `id: generateId(ID_PREFIXES.project)`

- [ ] **Step 4: Update maintenance service**

In `packages/core/src/services/maintenance.ts`:

Replace the import:
```typescript
// Remove: import { ulid } from 'ulid';
// Add:
import { generateId, ID_PREFIXES } from '@mostly/types';
```

Replace:
- Line 33: `id: ulid()` → `id: generateId(ID_PREFIXES.taskUpdate)`

- [ ] **Step 5: Update test factories**

In `packages/core/src/test-utils/factories.ts`:

Replace the import:
```typescript
// Remove: import { ulid } from 'ulid';
// Add:
import { generateId, ID_PREFIXES } from '@mostly/types';
```

Replace every `ulid()` call with the correct typed prefix:
- `makeWorkspace`: `id: generateId(ID_PREFIXES.workspace)`
- `makePrincipal`: `id: generateId(ID_PREFIXES.principal)`, `workspace_id: generateId(ID_PREFIXES.workspace)`
- `makeProject`: `id: generateId(ID_PREFIXES.project)`, `workspace_id: generateId(ID_PREFIXES.workspace)`, `actorId = generateId(ID_PREFIXES.principal)`
- `makeTask`: `id: generateId(ID_PREFIXES.task)`, `workspace_id: generateId(ID_PREFIXES.workspace)`, `actorId = generateId(ID_PREFIXES.principal)`
- `makeTaskUpdate`: `id: generateId(ID_PREFIXES.taskUpdate)`, `task_id: generateId(ID_PREFIXES.task)`, `created_by_id: generateId(ID_PREFIXES.principal)`

- [ ] **Step 6: Remove `ulid` dependency from @mostly/core**

In `packages/core/package.json`, remove `"ulid": "^2.3.0"` from `dependencies`.

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @mostly/core test`
Expected: All 118 tests pass. The factories now generate typed IDs, but since tests use overrides or don't assert ID format, they should all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/services/task.ts packages/core/src/services/principal.ts packages/core/src/services/project.ts packages/core/src/services/maintenance.ts packages/core/src/test-utils/factories.ts packages/core/package.json
git commit -m "refactor(core): replace ulid() with generateId() in all services and factories"
```

---

### Task 3: Switch pagination to `created_at`-based ordering

**Files:**
- Modify: `packages/db/src/repositories/task.ts:50-79`
- Modify: `packages/db/src/repositories/principal.ts:41-61`
- Modify: `packages/db/src/repositories/project.ts:42-62`
- Modify: `packages/db/__tests__/task-repo.test.ts`
- Modify: `packages/db/__tests__/principal-repo.test.ts`
- Modify: `packages/db/__tests__/project-repo.test.ts`

The task-update repository already uses `created_at|id` composite cursor pagination — follow that exact pattern.

- [ ] **Step 1: Update task repository `list` method**

In `packages/db/src/repositories/task.ts`, replace the `list` method (lines 50-79):

```typescript
import { eq, and, gt, lte, isNotNull, sql, or } from 'drizzle-orm';
```

(Add `or` to the import from drizzle-orm.)

Replace the `list` method body:

```typescript
  async list(
    workspaceId: string,
    filters: TaskListFilters,
    cursor?: string,
    limit: number = 50,
  ): Promise<PaginatedResult<Task>> {
    const conditions = [eq(tasks.workspace_id, workspaceId)];

    if (filters.status) conditions.push(eq(tasks.status, filters.status));
    if (filters.assignee_id) conditions.push(eq(tasks.assignee_id, filters.assignee_id));
    if (filters.project_id) conditions.push(eq(tasks.project_id, filters.project_id));
    if (filters.claimed_by_id) conditions.push(eq(tasks.claimed_by_id, filters.claimed_by_id));

    if (cursor) {
      const sepIdx = cursor.lastIndexOf('|');
      const cursorTime = cursor.slice(0, sepIdx);
      const cursorId = cursor.slice(sepIdx + 1);
      conditions.push(
        or(
          gt(tasks.created_at, cursorTime),
          and(eq(tasks.created_at, cursorTime), gt(tasks.id, cursorId)),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(tasks.created_at, tasks.id)
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toEntity);
    const lastItem = items[items.length - 1];
    return {
      items,
      next_cursor: hasMore && lastItem ? `${lastItem.created_at}|${lastItem.id}` : null,
    };
  }
```

- [ ] **Step 2: Update principal repository `list` method**

In `packages/db/src/repositories/principal.ts`, add `or` to the drizzle-orm import:

```typescript
import { eq, and, gt, or } from 'drizzle-orm';
```

Replace the `list` method body:

```typescript
  async list(workspaceId: string, cursor?: string, limit: number = 50): Promise<PaginatedResult<Principal>> {
    const conditions = [eq(principals.workspace_id, workspaceId)];
    if (cursor) {
      const sepIdx = cursor.lastIndexOf('|');
      const cursorTime = cursor.slice(0, sepIdx);
      const cursorId = cursor.slice(sepIdx + 1);
      conditions.push(
        or(
          gt(principals.created_at, cursorTime),
          and(eq(principals.created_at, cursorTime), gt(principals.id, cursorId)),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(principals)
      .where(and(...conditions))
      .orderBy(principals.created_at, principals.id)
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toEntity);
    const lastItem = items[items.length - 1];
    return {
      items,
      next_cursor: hasMore && lastItem ? `${lastItem.created_at}|${lastItem.id}` : null,
    };
  }
```

- [ ] **Step 3: Update project repository `list` method**

In `packages/db/src/repositories/project.ts`, add `or` to the drizzle-orm import:

```typescript
import { eq, and, gt, or } from 'drizzle-orm';
```

Replace the `list` method body:

```typescript
  async list(workspaceId: string, cursor?: string, limit: number = 50): Promise<PaginatedResult<Project>> {
    const conditions = [eq(projects.workspace_id, workspaceId)];
    if (cursor) {
      const sepIdx = cursor.lastIndexOf('|');
      const cursorTime = cursor.slice(0, sepIdx);
      const cursorId = cursor.slice(sepIdx + 1);
      conditions.push(
        or(
          gt(projects.created_at, cursorTime),
          and(eq(projects.created_at, cursorTime), gt(projects.id, cursorId)),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(projects.created_at, projects.id)
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toEntity);
    const lastItem = items[items.length - 1];
    return {
      items,
      next_cursor: hasMore && lastItem ? `${lastItem.created_at}|${lastItem.id}` : null,
    };
  }
```

- [ ] **Step 4: Update task repo pagination tests**

In `packages/db/__tests__/task-repo.test.ts`, update the pagination tests. The tests currently use hardcoded IDs like `01TK0001` that sort lexicographically. With `created_at` ordering, we need to give different `created_at` values to control order:

Replace the pagination test (around line 301):

```typescript
  it('list supports cursor pagination', async () => {
    await repo.create(makeTask({ id: 'tsk_aaaa0001', key: 'P-1', created_at: '2025-01-01T00:00:01.000Z', updated_at: '2025-01-01T00:00:01.000Z' }));
    await repo.create(makeTask({ id: 'tsk_aaaa0002', key: 'P-2', created_at: '2025-01-01T00:00:02.000Z', updated_at: '2025-01-01T00:00:02.000Z' }));
    await repo.create(makeTask({ id: 'tsk_aaaa0003', key: 'P-3', created_at: '2025-01-01T00:00:03.000Z', updated_at: '2025-01-01T00:00:03.000Z' }));

    const page1 = await repo.list(wsId, {}, undefined, 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.next_cursor).toBe('2025-01-01T00:00:02.000Z|tsk_aaaa0002');
    expect(page1.items[0].id).toBe('tsk_aaaa0001');
    expect(page1.items[1].id).toBe('tsk_aaaa0002');

    const page2 = await repo.list(wsId, {}, page1.next_cursor!, 2);
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].id).toBe('tsk_aaaa0003');
    expect(page2.next_cursor).toBeNull();
  });
```

Replace the pagination-with-filters test (around line 318):

```typescript
  it('list pagination works with filters', async () => {
    await repo.create(makeTask({ id: 'tsk_aaaa0001', key: 'P-1', status: 'open', created_at: '2025-01-01T00:00:01.000Z', updated_at: '2025-01-01T00:00:01.000Z' }));
    await repo.create(makeTask({ id: 'tsk_aaaa0002', key: 'P-2', status: 'closed', created_at: '2025-01-01T00:00:02.000Z', updated_at: '2025-01-01T00:00:02.000Z' }));
    await repo.create(makeTask({ id: 'tsk_aaaa0003', key: 'P-3', status: 'open', created_at: '2025-01-01T00:00:03.000Z', updated_at: '2025-01-01T00:00:03.000Z' }));
    await repo.create(makeTask({ id: 'tsk_aaaa0004', key: 'P-4', status: 'open', created_at: '2025-01-01T00:00:04.000Z', updated_at: '2025-01-01T00:00:04.000Z' }));

    const page1 = await repo.list(wsId, { status: 'open' }, undefined, 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.next_cursor).toBe('2025-01-01T00:00:03.000Z|tsk_aaaa0003');

    const page2 = await repo.list(wsId, { status: 'open' }, page1.next_cursor!, 2);
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].id).toBe('tsk_aaaa0004');
    expect(page2.next_cursor).toBeNull();
  });
```

- [ ] **Step 5: Update principal repo pagination tests**

In `packages/db/__tests__/principal-repo.test.ts`, replace the pagination test (around line 155):

```typescript
  it('list supports cursor pagination', async () => {
    await repo.create({ id: 'prin_aaa0001', workspace_id: wsId, handle: 'a', kind: 'human', display_name: null, metadata_json: null, is_active: true, created_at: '2025-01-01T00:00:01.000Z', updated_at: '2025-01-01T00:00:01.000Z' });
    await repo.create({ id: 'prin_aaa0002', workspace_id: wsId, handle: 'b', kind: 'human', display_name: null, metadata_json: null, is_active: true, created_at: '2025-01-01T00:00:02.000Z', updated_at: '2025-01-01T00:00:02.000Z' });
    await repo.create({ id: 'prin_aaa0003', workspace_id: wsId, handle: 'c', kind: 'human', display_name: null, metadata_json: null, is_active: true, created_at: '2025-01-01T00:00:03.000Z', updated_at: '2025-01-01T00:00:03.000Z' });

    const page1 = await repo.list(wsId, undefined, 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.next_cursor).toBe('2025-01-01T00:00:02.000Z|prin_aaa0002');
    expect(page1.items[0].id).toBe('prin_aaa0001');
    expect(page1.items[1].id).toBe('prin_aaa0002');

    const page2 = await repo.list(wsId, page1.next_cursor!, 2);
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].id).toBe('prin_aaa0003');
    expect(page2.next_cursor).toBeNull();
  });
```

- [ ] **Step 6: Update project repo pagination tests**

In `packages/db/__tests__/project-repo.test.ts`, replace the pagination test (around line 158):

```typescript
  it('list supports cursor pagination', async () => {
    await repo.create({ id: 'proj_aaa0001', workspace_id: wsId, key: 'A', name: 'A', description: null, is_archived: false, created_by_id: actorId, updated_by_id: actorId, created_at: '2025-01-01T00:00:01.000Z', updated_at: '2025-01-01T00:00:01.000Z' });
    await repo.create({ id: 'proj_aaa0002', workspace_id: wsId, key: 'B', name: 'B', description: null, is_archived: false, created_by_id: actorId, updated_by_id: actorId, created_at: '2025-01-01T00:00:02.000Z', updated_at: '2025-01-01T00:00:02.000Z' });
    await repo.create({ id: 'proj_aaa0003', workspace_id: wsId, key: 'C', name: 'C', description: null, is_archived: false, created_by_id: actorId, updated_by_id: actorId, created_at: '2025-01-01T00:00:03.000Z', updated_at: '2025-01-01T00:00:03.000Z' });

    const page1 = await repo.list(wsId, undefined, 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.next_cursor).toBe('2025-01-01T00:00:02.000Z|proj_aaa0002');
    expect(page1.items[0].id).toBe('proj_aaa0001');
    expect(page1.items[1].id).toBe('proj_aaa0002');

    const page2 = await repo.list(wsId, page1.next_cursor!, 2);
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].id).toBe('proj_aaa0003');
    expect(page2.next_cursor).toBeNull();
  });
```

- [ ] **Step 7: Run all db tests**

Run: `pnpm --filter @mostly/db test`
Expected: All 80 tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/repositories/task.ts packages/db/src/repositories/principal.ts packages/db/src/repositories/project.ts packages/db/__tests__/task-repo.test.ts packages/db/__tests__/principal-repo.test.ts packages/db/__tests__/project-repo.test.ts
git commit -m "refactor(db): switch cursor pagination from ID-based to created_at-based ordering"
```

---

### Task 4: Replace `ulid()` in server and CLI seed code

**Files:**
- Modify: `packages/server/src/serve.ts`
- Modify: `packages/cli/src/commands/init.ts`
- Modify: `packages/cli/src/commands/serve.ts`

- [ ] **Step 1: Update server serve.ts**

In `packages/server/src/serve.ts`:

Replace the import:
```typescript
// Remove: import { ulid } from 'ulid';
// Add:
import { generateId, ID_PREFIXES } from '@mostly/types';
```

Replace line 65:
```typescript
// Old: id: ulid(),
// New:
      id: generateId(ID_PREFIXES.workspace),
```

- [ ] **Step 2: Update CLI init.ts**

In `packages/cli/src/commands/init.ts`:

Replace the import:
```typescript
// Remove: import { ulid } from 'ulid';
// Add:
import { generateId, ID_PREFIXES } from '@mostly/types';
```

Replace line 62:
```typescript
// Old: id: ulid(),
// New:
          id: generateId(ID_PREFIXES.workspace),
```

- [ ] **Step 3: Update CLI serve.ts**

In `packages/cli/src/commands/serve.ts`:

Replace the import:
```typescript
// Remove: import { ulid } from 'ulid';
// Add:
import { generateId, ID_PREFIXES } from '@mostly/types';
```

Replace line 43:
```typescript
// Old: id: ulid(),
// New:
          id: generateId(ID_PREFIXES.workspace),
```

- [ ] **Step 4: Remove `ulid` dependency from all packages**

In `packages/core/package.json`: remove `"ulid": "^2.3.0"` from dependencies (if not already done in Task 2).

In `packages/cli/package.json`: remove `"ulid": "^2.3.0"` from dependencies.

In `packages/server/package.json`: check if `ulid` is listed; if so, remove it.

In `packages/types/package.json`: remove `"ulid": "^2.3.0"` from dependencies.

Run: `pnpm install` to update the lockfile.

- [ ] **Step 5: Run all tests**

Run: `pnpm --filter @mostly/types test && pnpm --filter @mostly/core test && pnpm --filter @mostly/db test && pnpm --filter @mostly/server test && pnpm --filter @mostly/cli test && pnpm test:e2e`
Expected: All tests pass (326 total + new id tests).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/serve.ts packages/cli/src/commands/init.ts packages/cli/src/commands/serve.ts packages/core/package.json packages/cli/package.json packages/server/package.json packages/types/package.json pnpm-lock.yaml
git commit -m "refactor: replace ulid() with generateId() in server/CLI seed code, remove ulid dependency"
```

---

### Task 5: Verify `ulid` is fully removed and run full verification

- [ ] **Step 1: Grep for any remaining `ulid` references**

Run: `grep -r "ulid" --include="*.ts" packages/`
Expected: No matches (excluding comments or references in test strings/plan docs).

Run: `grep -r '"ulid"' packages/*/package.json`
Expected: No matches.

- [ ] **Step 2: Full build**

Run: `pnpm build`
Expected: All packages build successfully.

- [ ] **Step 3: Full test suite**

Run: `pnpm -r --if-present --filter '!@mostly/mcp' run test && pnpm test:e2e`
Expected: All tests pass.

- [ ] **Step 4: Worker bundle**

Run: `pnpm --filter @mostly/server build:worker`
Expected: Bundle builds successfully.

- [ ] **Step 5: Commit (only if any cleanup was needed)**

If any stragglers were found and fixed:
```bash
git add -A
git commit -m "chore: remove remaining ulid references"
```
