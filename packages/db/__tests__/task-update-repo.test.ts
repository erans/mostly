import { describe, expect, it, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { DrizzleWorkspaceRepository } from '../src/repositories/workspace';
import { DrizzlePrincipalRepository } from '../src/repositories/principal';
import { DrizzleTaskRepository } from '../src/repositories/task';
import { DrizzleTaskUpdateRepository } from '../src/repositories/task-update';

describe('DrizzleTaskUpdateRepository', () => {
  let db: ReturnType<typeof createTestDb>;
  let repo: DrizzleTaskUpdateRepository;

  const wsId = '01WS0001';
  const principalId = '01PR0001';
  const taskId = '01TK0001';
  const now = '2025-01-01T00:00:00.000Z';

  async function seedTask() {
    const wsRepo = new DrizzleWorkspaceRepository(db);
    await wsRepo.create({ id: wsId, slug: 'default', name: 'Default', created_at: now, updated_at: now });

    const principalRepo = new DrizzlePrincipalRepository(db);
    await principalRepo.create({
      id: principalId,
      workspace_id: wsId,
      handle: 'alice',
      kind: 'human',
      display_name: 'Alice',
      metadata_json: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    const taskRepo = new DrizzleTaskRepository(db);
    await taskRepo.create({
      id: taskId,
      workspace_id: wsId,
      project_id: null,
      key: 'PROJ-1',
      type: 'feature',
      title: 'A task',
      description: null,
      status: 'open',
      resolution: null,
      assignee_id: null,
      claimed_by_id: null,
      claim_expires_at: null,
      version: 1,
      created_by_id: principalId,
      updated_by_id: principalId,
      resolved_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  beforeEach(async () => {
    db = createTestDb();
    await seedTask();
    repo = new DrizzleTaskUpdateRepository(db);
  });

  it('create returns the correct entity', async () => {
    const update = await repo.create({
      id: '01TU0001',
      task_id: taskId,
      kind: 'note',
      body: 'This is a note.',
      metadata_json: null,
      created_by_id: principalId,
      created_at: now,
    });

    expect(update).toEqual({
      id: '01TU0001',
      task_id: taskId,
      kind: 'note',
      body: 'This is a note.',
      metadata_json: null,
      created_by_id: principalId,
      created_at: now,
    });
  });

  it('create stores and retrieves metadata_json correctly', async () => {
    const meta = { key: 'value', nested: { count: 42 } };
    await repo.create({
      id: '01TU0002',
      task_id: taskId,
      kind: 'progress',
      body: 'With metadata',
      metadata_json: meta,
      created_by_id: principalId,
      created_at: now,
    });

    const result = await repo.list(taskId);
    expect(result.items[0].metadata_json).toEqual(meta);
  });

  it('list returns updates for a task ordered by created_at', async () => {
    await repo.create({
      id: '01TU0001',
      task_id: taskId,
      kind: 'note',
      body: 'First',
      metadata_json: null,
      created_by_id: principalId,
      created_at: '2025-01-01T00:00:00.000Z',
    });
    await repo.create({
      id: '01TU0002',
      task_id: taskId,
      kind: 'progress',
      body: 'Second',
      metadata_json: null,
      created_by_id: principalId,
      created_at: '2025-01-02T00:00:00.000Z',
    });
    await repo.create({
      id: '01TU0003',
      task_id: taskId,
      kind: 'result',
      body: 'Third',
      metadata_json: null,
      created_by_id: principalId,
      created_at: '2025-01-03T00:00:00.000Z',
    });

    const result = await repo.list(taskId);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe('01TU0001');
    expect(result.items[1].id).toBe('01TU0002');
    expect(result.items[2].id).toBe('01TU0003');
    expect(result.next_cursor).toBeNull();
  });

  it('list scopes to the given taskId', async () => {
    const taskRepo = new DrizzleTaskRepository(db);
    await taskRepo.create({
      id: '01TK0002',
      workspace_id: wsId,
      project_id: null,
      key: 'PROJ-2',
      type: 'feature',
      title: 'Another task',
      description: null,
      status: 'open',
      resolution: null,
      assignee_id: null,
      claimed_by_id: null,
      claim_expires_at: null,
      version: 1,
      created_by_id: principalId,
      updated_by_id: principalId,
      resolved_at: null,
      created_at: now,
      updated_at: now,
    });

    await repo.create({
      id: '01TU0001',
      task_id: taskId,
      kind: 'note',
      body: 'Task 1 update',
      metadata_json: null,
      created_by_id: principalId,
      created_at: now,
    });
    await repo.create({
      id: '01TU0002',
      task_id: '01TK0002',
      kind: 'note',
      body: 'Task 2 update',
      metadata_json: null,
      created_by_id: principalId,
      created_at: now,
    });

    const result = await repo.list(taskId);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('01TU0001');
  });

  it('list supports cursor pagination', async () => {
    await repo.create({
      id: '01TU0001',
      task_id: taskId,
      kind: 'note',
      body: 'First',
      metadata_json: null,
      created_by_id: principalId,
      created_at: '2025-01-01T00:00:00.000Z',
    });
    await repo.create({
      id: '01TU0002',
      task_id: taskId,
      kind: 'note',
      body: 'Second',
      metadata_json: null,
      created_by_id: principalId,
      created_at: '2025-01-02T00:00:00.000Z',
    });
    await repo.create({
      id: '01TU0003',
      task_id: taskId,
      kind: 'note',
      body: 'Third',
      metadata_json: null,
      created_by_id: principalId,
      created_at: '2025-01-03T00:00:00.000Z',
    });

    const page1 = await repo.list(taskId, undefined, 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.items[0].id).toBe('01TU0001');
    expect(page1.items[1].id).toBe('01TU0002');
    expect(page1.next_cursor).not.toBeNull();

    const page2 = await repo.list(taskId, page1.next_cursor!, 2);
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].id).toBe('01TU0003');
    expect(page2.next_cursor).toBeNull();
  });

  it('createWithAgentContext inserts both update and context rows', async () => {
    const update = await repo.createWithAgentContext(
      {
        id: '01TU0001',
        task_id: taskId,
        kind: 'claim',
        body: 'Agent claimed task',
        metadata_json: null,
        created_by_id: principalId,
        created_at: now,
      },
      [
        {
          id: '01AC0001',
          task_update_id: '01TU0001',
          principal_id: principalId,
          session_id: 'sess-1',
          run_id: 'run-1',
          tool_name: 'claim_task',
          tool_call_id: 'call-1',
          source_kind: 'agent',
          source_ref: 'agent-ref',
          metadata_json: { extra: 'info' },
          created_at: now,
        },
      ],
    );

    expect(update.id).toBe('01TU0001');
    expect(update.kind).toBe('claim');

    const listed = await repo.list(taskId);
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0].id).toBe('01TU0001');
  });

  it('createWithAgentContext inserts multiple context rows', async () => {
    await repo.createWithAgentContext(
      {
        id: '01TU0001',
        task_id: taskId,
        kind: 'progress',
        body: 'Multi context',
        metadata_json: null,
        created_by_id: principalId,
        created_at: now,
      },
      [
        {
          id: '01AC0001',
          task_update_id: '01TU0001',
          principal_id: principalId,
          session_id: null,
          run_id: null,
          tool_name: null,
          tool_call_id: null,
          source_kind: null,
          source_ref: null,
          metadata_json: null,
          created_at: now,
        },
        {
          id: '01AC0002',
          task_update_id: '01TU0001',
          principal_id: principalId,
          session_id: 'sess-2',
          run_id: null,
          tool_name: null,
          tool_call_id: null,
          source_kind: null,
          source_ref: null,
          metadata_json: null,
          created_at: now,
        },
      ],
    );

    const listed = await repo.list(taskId);
    expect(listed.items).toHaveLength(1);
  });

  it('createWithAgentContext works with empty contexts array', async () => {
    const update = await repo.createWithAgentContext(
      {
        id: '01TU0001',
        task_id: taskId,
        kind: 'note',
        body: 'No contexts',
        metadata_json: null,
        created_by_id: principalId,
        created_at: now,
      },
      [],
    );

    expect(update.id).toBe('01TU0001');
    const listed = await repo.list(taskId);
    expect(listed.items).toHaveLength(1);
  });
});
