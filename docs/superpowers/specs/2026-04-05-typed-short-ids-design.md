# Typed Short IDs Design

## Goal

Replace opaque 26-character ULIDs with short, typed IDs (e.g., `tsk_k2pn5jw8`) that are easy to reference, copy, say aloud, and identify by entity type at a glance.

## Scope

Entities that are referenced as foreign keys by other entities:

| Entity | Prefix | Example |
|--------|--------|---------|
| Workspace | `ws` | `ws_a3kf9x2m` |
| Principal | `prin` | `prin_m7tn2qb4` |
| Project | `proj` | `proj_x8rb4wc6` |
| Task | `tsk` | `tsk_k2pn5jw8` |
| Task Update | `upd` | `upd_r4hs7yd3` |

Task `key` fields (e.g., `PROJ-42`) are unchanged. Keys are a separate user-facing reference; IDs are the primary key / foreign key system.

## ID Format

```
{prefix}_{random}
```

- **Prefix**: 2-4 lowercase ASCII characters identifying the entity type (see table above).
- **Separator**: underscore (`_`).
- **Random part**: 8 characters of lowercase Crockford Base32: `0123456789abcdefghjkmnpqrstvwxyz` (32 symbols, excluding `i`, `l`, `o`, `u` to avoid visual ambiguity).
- **Total length**: 5-13 characters depending on prefix (e.g., `ws_a3kf9x2m` = 11, `tsk_k2pn5jw8` = 12).
- **Entropy**: 8 chars * 5 bits = 40 bits = ~1.1 trillion combinations per prefix.
- **Case**: Always lowercase. Comparisons are case-insensitive in practice (Crockford Base32 is case-insensitive by spec).

## Generation

### `generateId(prefix: string): string`

Lives in `@mostly/types` (the lowest-level package, available to all other packages).

- Uses `crypto.getRandomValues` for the random bytes — works in both Node.js and Cloudflare Workers.
- Pure function: takes a prefix string, returns a complete ID string.
- No database interaction — generation is stateless.

### Collision handling

The DB primary key unique constraint is the backstop. Services wrap inserts in a retry loop:

1. Generate ID with `generateId(prefix)`.
2. Attempt insert.
3. If unique constraint violation, regenerate and retry (max 3 attempts).
4. If all 3 fail, throw.

With 40 bits of entropy, collisions require ~1 million rows to reach a 1-in-a-million probability. The retry is free insurance.

### `isUniqueViolation(err: unknown): boolean`

A helper (in `@mostly/db` or `@mostly/types`) that detects SQLite unique constraint errors. Used by the retry logic.

### `parseIdPrefix(id: string): string | null`

Extracts and returns the prefix from an ID string (everything before the first `_`), or `null` if the format is invalid. Useful for API input validation — e.g., rejecting a `proj_` ID passed to a task endpoint.

## Pagination Changes

### Problem

Current cursor pagination uses `orderBy(tasks.id)` with `where(id > cursor)`. This works because ULIDs are time-sorted. Random IDs break this — ordering by random strings gives arbitrary results.

### Solution

Switch to `created_at`-based ordering with `id` as a tiebreaker for same-millisecond items:

- **Order by**: `created_at ASC, id ASC`
- **Cursor format**: composite string `{created_at}|{id}` — the cursor encodes both values so the next page can resume correctly.
- **Where clause**: `(created_at > cursor_ts) OR (created_at = cursor_ts AND id > cursor_id)`

### Affected repositories

- `task.ts:list()` — has cursor pagination
- `principal.ts:list()` — has cursor pagination (if applicable)

All other repository methods use direct lookups (`findById`, `findByKey`) and are unaffected.

## What Changes

1. **New**: `generateId()`, `parseIdPrefix()` in `@mostly/types`.
2. **New**: `isUniqueViolation()` helper.
3. **Modified**: All service `create` methods — replace `ulid()` with `generateId(prefix)` + retry loop.
4. **Modified**: Test factories in `@mostly/core` — use `generateId()` instead of `ulid()`.
5. **Modified**: Seed data in `serve.ts` and CLI `init.ts` — use `generateId()`.
6. **Modified**: List/pagination repositories — switch from ID-based to `created_at`-based ordering.
7. **Removed**: `ulid` dependency from `@mostly/core`, `@mostly/server`, `@mostly/cli`.

## What Doesn't Change

- DB schema: columns stay `text('id')` primary keys. No column changes.
- No data migration: this is v0 with no production data.
- Task `key` field: `PROJ-42` style keys are a separate concept, unchanged.
- Foreign key columns: still `text` referencing the parent ID — the new IDs are just shorter strings.

## Testing

- Unit tests for `generateId`: correct format, prefix, length, alphabet compliance.
- Unit tests for `parseIdPrefix`: valid IDs, invalid formats, edge cases.
- Unit tests for collision retry logic (mock a unique violation on first attempt, succeed on retry).
- Update all existing tests — factory-generated IDs will be in the new format automatically once factories use `generateId`.
- Pagination tests: verify `created_at`-based ordering returns correct results and cursors.
