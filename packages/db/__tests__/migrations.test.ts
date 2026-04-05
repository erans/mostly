import { describe, expect, it } from 'vitest';
import { createTestDb } from './helpers';
import { workspaces } from '../src/schema/index';
import { eq, sql } from 'drizzle-orm';

describe('db migrations', () => {
  it('applies migrations and creates all tables', () => {
    const db = createTestDb();

    // Query sqlite_master for all user tables
    const result = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name`
    );
    const tableNames = result.map((r) => r.name).sort();

    expect(tableNames).toEqual([
      'agent_action_context',
      'principal',
      'project',
      'task',
      'task_key_sequence',
      'task_update',
      'workspace',
    ]);
  });

  it('inserts and reads a workspace row', () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    db.insert(workspaces).values({
      id: '01JA0000000000000000000001',
      slug: 'test-workspace',
      name: 'Test Workspace',
      created_at: now,
      updated_at: now,
    }).run();

    const rows = db.select().from(workspaces).where(
      eq(workspaces.slug, 'test-workspace')
    ).all();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('01JA0000000000000000000001');
    expect(rows[0].name).toBe('Test Workspace');
    expect(rows[0].slug).toBe('test-workspace');
    expect(rows[0].created_at).toBe(now);
  });
});
