import { describe, expect, it, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { DrizzleWorkspaceRepository } from '../src/repositories/workspace';
import { DrizzleTaskRepository } from '../src/repositories/task';

describe('DrizzleTaskRepository', () => {
  let repo: DrizzleTaskRepository;
  const wsId = '01WS0001';
  const actorId = '01AC0001';
  const now = '2025-01-01T00:00:00.000Z';

  function makeTask(overrides: Record<string, unknown> = {}) {
    return {
      id: '01TK0001',
      workspace_id: wsId,
      project_id: null as string | null,
      key: 'PROJ-1',
      type: 'feature',
      title: 'A task',
      description: null as string | null,
      status: 'open',
      resolution: null as string | null,
      assignee_id: null as string | null,
      claimed_by_id: null as string | null,
      claim_expires_at: null as string | null,
      version: 1,
      created_by_id: actorId,
      updated_by_id: actorId,
      resolved_at: null as string | null,
      created_at: now,
      updated_at: now,
      ...overrides,
    };
  }

  beforeEach(async () => {
    const db = createTestDb();
    const wsRepo = new DrizzleWorkspaceRepository(db);
    await wsRepo.create({ id: wsId, slug: 'default', name: 'Default', created_at: now, updated_at: now });
    repo = new DrizzleTaskRepository(db);
  });

  // ---- findById ----

  it('findById returns task after create', async () => {
    await repo.create(makeTask());
    const found = await repo.findById('01TK0001');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('01TK0001');
    expect(found!.key).toBe('PROJ-1');
    expect(found!.type).toBe('feature');
    expect(found!.status).toBe('open');
    expect(found!.version).toBe(1);
  });

  it('findById returns null for non-existent id', async () => {
    const found = await repo.findById('nonexistent');
    expect(found).toBeNull();
  });

  // ---- findByKey ----

  it('findByKey returns the task', async () => {
    await repo.create(makeTask());
    const found = await repo.findByKey(wsId, 'PROJ-1');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('01TK0001');
  });

  it('findByKey returns null for non-existent key', async () => {
    const found = await repo.findByKey(wsId, 'NONEXIST-1');
    expect(found).toBeNull();
  });

  it('findByKey scopes to workspace', async () => {
    await repo.create(makeTask());
    const found = await repo.findByKey('other-ws', 'PROJ-1');
    expect(found).toBeNull();
  });

  // ---- create ----

  it('create returns the full task entity', async () => {
    const task = await repo.create(makeTask({
      description: 'Some description',
      assignee_id: 'agent-1',
      project_id: 'proj-1',
    }));

    expect(task).toEqual({
      id: '01TK0001',
      workspace_id: wsId,
      project_id: 'proj-1',
      key: 'PROJ-1',
      type: 'feature',
      title: 'A task',
      description: 'Some description',
      status: 'open',
      resolution: null,
      assignee_id: 'agent-1',
      claimed_by_id: null,
      claim_expires_at: null,
      version: 1,
      created_by_id: actorId,
      updated_by_id: actorId,
      resolved_at: null,
      created_at: now,
      updated_at: now,
    });
  });

  it('create handles all nullable fields as null', async () => {
    const task = await repo.create(makeTask());
    expect(task.project_id).toBeNull();
    expect(task.description).toBeNull();
    expect(task.resolution).toBeNull();
    expect(task.assignee_id).toBeNull();
    expect(task.claimed_by_id).toBeNull();
    expect(task.claim_expires_at).toBeNull();
    expect(task.resolved_at).toBeNull();
  });

  // ---- update with optimistic concurrency ----

  it('update modifies fields and bumps version', async () => {
    await repo.create(makeTask());

    const later = '2025-06-01T00:00:00.000Z';
    const updated = await repo.update('01TK0001', {
      title: 'Updated title',
      status: 'in_progress',
      version: 2,
      updated_by_id: actorId,
      updated_at: later,
    }, 1);

    expect(updated.title).toBe('Updated title');
    expect(updated.status).toBe('in_progress');
    expect(updated.version).toBe(2);
    expect(updated.updated_at).toBe(later);
  });

  it('update throws ConflictError on version mismatch', async () => {
    await repo.create(makeTask());

    // First update succeeds
    await repo.update('01TK0001', {
      title: 'First update',
      version: 2,
      updated_by_id: actorId,
      updated_at: now,
    }, 1);

    // Second update with stale version fails
    await expect(
      repo.update('01TK0001', {
        title: 'Stale update',
        version: 2,
        updated_by_id: actorId,
        updated_at: now,
      }, 1),
    ).rejects.toThrow('expected version 1');
  });

  it('update throws ConflictError (not NotFoundError) when version is wrong', async () => {
    await repo.create(makeTask());

    try {
      await repo.update('01TK0001', {
        title: 'Bad version',
        version: 99,
        updated_by_id: actorId,
        updated_at: now,
      }, 5);
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('conflict');
    }
  });

  it('update throws NotFoundError for non-existent task', async () => {
    await expect(
      repo.update('nonexistent', {
        title: 'Nope',
        version: 2,
        updated_by_id: actorId,
        updated_at: now,
      }, 1),
    ).rejects.toThrow('task not found: nonexistent');
  });

  it('update sets nullable fields to null', async () => {
    await repo.create(makeTask({
      assignee_id: 'someone',
      claimed_by_id: 'claimer',
      claim_expires_at: '2025-12-01T00:00:00.000Z',
    }));

    const updated = await repo.update('01TK0001', {
      assignee_id: null,
      claimed_by_id: null,
      claim_expires_at: null,
      version: 2,
      updated_by_id: actorId,
      updated_at: now,
    }, 1);

    expect(updated.assignee_id).toBeNull();
    expect(updated.claimed_by_id).toBeNull();
    expect(updated.claim_expires_at).toBeNull();
  });

  it('update only modifies provided fields', async () => {
    await repo.create(makeTask({ title: 'Original', description: 'Keep me' }));

    const updated = await repo.update('01TK0001', {
      title: 'Changed',
      version: 2,
      updated_by_id: actorId,
      updated_at: now,
    }, 1);

    expect(updated.title).toBe('Changed');
    expect(updated.description).toBe('Keep me');
  });

  // ---- list with filters ----

  it('list returns tasks in workspace', async () => {
    await repo.create(makeTask({ id: '01TK0001' }));
    await repo.create(makeTask({ id: '01TK0002', key: 'PROJ-2' }));

    const result = await repo.list(wsId, {});
    expect(result.items).toHaveLength(2);
    expect(result.next_cursor).toBeNull();
  });

  it('list scopes to workspace', async () => {
    await repo.create(makeTask());
    const result = await repo.list('other-ws', {});
    expect(result.items).toHaveLength(0);
  });

  it('list filters by status', async () => {
    await repo.create(makeTask({ id: '01TK0001', status: 'open' }));
    await repo.create(makeTask({ id: '01TK0002', key: 'PROJ-2', status: 'closed' }));

    const result = await repo.list(wsId, { status: 'open' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('01TK0001');
  });

  it('list filters by assignee_id', async () => {
    await repo.create(makeTask({ id: '01TK0001', assignee_id: 'alice' }));
    await repo.create(makeTask({ id: '01TK0002', key: 'PROJ-2', assignee_id: 'bob' }));

    const result = await repo.list(wsId, { assignee_id: 'alice' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].assignee_id).toBe('alice');
  });

  it('list filters by project_id', async () => {
    await repo.create(makeTask({ id: '01TK0001', project_id: 'projA' }));
    await repo.create(makeTask({ id: '01TK0002', key: 'PROJ-2', project_id: 'projB' }));

    const result = await repo.list(wsId, { project_id: 'projA' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].project_id).toBe('projA');
  });

  it('list filters by claimed_by_id', async () => {
    await repo.create(makeTask({ id: '01TK0001', claimed_by_id: 'agent-1' }));
    await repo.create(makeTask({ id: '01TK0002', key: 'PROJ-2', claimed_by_id: null }));

    const result = await repo.list(wsId, { claimed_by_id: 'agent-1' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].claimed_by_id).toBe('agent-1');
  });

  it('list combines multiple filters', async () => {
    await repo.create(makeTask({ id: '01TK0001', status: 'open', assignee_id: 'alice', project_id: 'projA' }));
    await repo.create(makeTask({ id: '01TK0002', key: 'PROJ-2', status: 'open', assignee_id: 'bob', project_id: 'projA' }));
    await repo.create(makeTask({ id: '01TK0003', key: 'PROJ-3', status: 'closed', assignee_id: 'alice', project_id: 'projA' }));

    const result = await repo.list(wsId, { status: 'open', assignee_id: 'alice', project_id: 'projA' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('01TK0001');
  });

  it('list with empty filters returns all workspace tasks', async () => {
    await repo.create(makeTask({ id: '01TK0001' }));
    await repo.create(makeTask({ id: '01TK0002', key: 'PROJ-2' }));
    await repo.create(makeTask({ id: '01TK0003', key: 'PROJ-3' }));

    const result = await repo.list(wsId, {});
    expect(result.items).toHaveLength(3);
  });

  // ---- cursor pagination ----

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

  // ---- nextKeyNumber ----

  it('nextKeyNumber returns 1 for first allocation', async () => {
    const num = await repo.nextKeyNumber(wsId, 'PROJ');
    expect(num).toBe(1);
  });

  it('nextKeyNumber increments monotonically', async () => {
    const n1 = await repo.nextKeyNumber(wsId, 'PROJ');
    const n2 = await repo.nextKeyNumber(wsId, 'PROJ');
    const n3 = await repo.nextKeyNumber(wsId, 'PROJ');

    expect(n1).toBe(1);
    expect(n2).toBe(2);
    expect(n3).toBe(3);
  });

  it('nextKeyNumber tracks separate prefixes independently', async () => {
    const a1 = await repo.nextKeyNumber(wsId, 'ALPHA');
    const b1 = await repo.nextKeyNumber(wsId, 'BETA');
    const a2 = await repo.nextKeyNumber(wsId, 'ALPHA');
    const b2 = await repo.nextKeyNumber(wsId, 'BETA');

    expect(a1).toBe(1);
    expect(b1).toBe(1);
    expect(a2).toBe(2);
    expect(b2).toBe(2);
  });

  it('nextKeyNumber tracks separate workspaces independently', async () => {
    // Create a second workspace
    const db = createTestDb();
    const wsRepo = new DrizzleWorkspaceRepository(db);
    await wsRepo.create({ id: 'ws-A', slug: 'a', name: 'A', created_at: now, updated_at: now });
    await wsRepo.create({ id: 'ws-B', slug: 'b', name: 'B', created_at: now, updated_at: now });
    const taskRepo = new DrizzleTaskRepository(db);

    const a1 = await taskRepo.nextKeyNumber('ws-A', 'PROJ');
    const b1 = await taskRepo.nextKeyNumber('ws-B', 'PROJ');
    const a2 = await taskRepo.nextKeyNumber('ws-A', 'PROJ');

    expect(a1).toBe(1);
    expect(b1).toBe(1);
    expect(a2).toBe(2);
  });

  // ---- findWithExpiredClaims ----

  it('findWithExpiredClaims returns tasks with expired claims', async () => {
    const pastDate = '2020-01-01T00:00:00.000Z';
    const futureDate = '2099-01-01T00:00:00.000Z';

    // Expired claim
    await repo.create(makeTask({
      id: '01TK0001',
      key: 'P-1',
      claimed_by_id: 'agent-1',
      claim_expires_at: pastDate,
    }));

    // Not expired claim
    await repo.create(makeTask({
      id: '01TK0002',
      key: 'P-2',
      claimed_by_id: 'agent-2',
      claim_expires_at: futureDate,
    }));

    // No claim at all
    await repo.create(makeTask({
      id: '01TK0003',
      key: 'P-3',
      claimed_by_id: null,
      claim_expires_at: null,
    }));

    const expired = await repo.findWithExpiredClaims(wsId);
    expect(expired).toHaveLength(1);
    expect(expired[0].id).toBe('01TK0001');
    expect(expired[0].claimed_by_id).toBe('agent-1');
  });

  it('findWithExpiredClaims scopes to workspace', async () => {
    const pastDate = '2020-01-01T00:00:00.000Z';
    await repo.create(makeTask({
      claimed_by_id: 'agent-1',
      claim_expires_at: pastDate,
    }));

    const expired = await repo.findWithExpiredClaims('other-ws');
    expect(expired).toHaveLength(0);
  });

  it('findWithExpiredClaims returns empty when no expired claims', async () => {
    const futureDate = '2099-01-01T00:00:00.000Z';
    await repo.create(makeTask({
      claimed_by_id: 'agent-1',
      claim_expires_at: futureDate,
    }));

    const expired = await repo.findWithExpiredClaims(wsId);
    expect(expired).toHaveLength(0);
  });

  it('findWithExpiredClaims excludes tasks without claimed_by_id even if claim_expires_at is past', async () => {
    // Edge case: claim_expires_at is set but claimed_by_id is null (already released)
    await repo.create(makeTask({
      claimed_by_id: null,
      claim_expires_at: '2020-01-01T00:00:00.000Z',
    }));

    const expired = await repo.findWithExpiredClaims(wsId);
    expect(expired).toHaveLength(0);
  });

  // ---- entity mapping edge cases ----

  it('preserves all task fields through create and findById round-trip', async () => {
    const fullTask = makeTask({
      project_id: 'proj-1',
      description: 'A detailed description',
      status: 'claimed',
      resolution: null,
      assignee_id: 'user-1',
      claimed_by_id: 'agent-1',
      claim_expires_at: '2025-12-01T00:00:00.000Z',
      resolved_at: null,
    });

    await repo.create(fullTask);
    const found = await repo.findById('01TK0001');

    expect(found).toEqual(fullTask);
  });
});
