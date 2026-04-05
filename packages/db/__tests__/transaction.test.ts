import { describe, expect, it } from 'vitest';
import { createTestDb } from './helpers';
import { DrizzleTransactionManager } from '../src/repositories/transaction';
import { DrizzleWorkspaceRepository } from '../src/repositories/workspace';
import { DrizzleTaskRepository } from '../src/repositories/task';
import { DrizzlePrincipalRepository } from '../src/repositories/principal';

describe('DrizzleTransactionManager', () => {
  const now = '2025-01-01T00:00:00.000Z';
  const wsId = '01WS0001';
  const principalId = '01PR0001';

  function makeTask(id: string, key: string) {
    return {
      id,
      workspace_id: wsId,
      project_id: null as string | null,
      key,
      type: 'feature',
      title: 'A task',
      description: null as string | null,
      status: 'open',
      resolution: null as string | null,
      assignee_id: null as string | null,
      claimed_by_id: null as string | null,
      claim_expires_at: null as string | null,
      version: 1,
      created_by_id: principalId,
      updated_by_id: principalId,
      resolved_at: null as string | null,
      created_at: now,
      updated_at: now,
    };
  }

  async function seedWorkspaceAndPrincipal(db: ReturnType<typeof createTestDb>) {
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
  }

  it('operations in a transaction all succeed', async () => {
    const db = createTestDb();
    await seedWorkspaceAndPrincipal(db);
    const txManager = new DrizzleTransactionManager(db);
    const taskRepo = new DrizzleTaskRepository(db);

    await txManager.withTransaction(async (ctx) => {
      await ctx.tasks.create(makeTask('01TK0001', 'PROJ-1'));
      await ctx.tasks.create(makeTask('01TK0002', 'PROJ-2'));
    });

    const t1 = await taskRepo.findById('01TK0001');
    const t2 = await taskRepo.findById('01TK0002');
    expect(t1).not.toBeNull();
    expect(t2).not.toBeNull();
  });

  it('transaction-scoped repos work correctly', async () => {
    const db = createTestDb();
    await seedWorkspaceAndPrincipal(db);
    const txManager = new DrizzleTransactionManager(db);

    let taskFromTx: Awaited<ReturnType<typeof txManager.withTransaction>> | null = null;

    taskFromTx = await txManager.withTransaction(async (ctx) => {
      const task = await ctx.tasks.create(makeTask('01TK0001', 'PROJ-1'));
      return task;
    });

    expect(taskFromTx).not.toBeNull();
    expect((taskFromTx as any).id).toBe('01TK0001');
  });

  it('rolls back changes on error', async () => {
    const db = createTestDb();
    await seedWorkspaceAndPrincipal(db);
    const txManager = new DrizzleTransactionManager(db);
    const taskRepo = new DrizzleTaskRepository(db);

    await expect(
      txManager.withTransaction(async (ctx) => {
        await ctx.tasks.create(makeTask('01TK0001', 'PROJ-1'));
        throw new Error('Intentional rollback');
      }),
    ).rejects.toThrow('Intentional rollback');

    const t1 = await taskRepo.findById('01TK0001');
    expect(t1).toBeNull();
  });

  it('withTransaction returns the value from the callback', async () => {
    const db = createTestDb();
    await seedWorkspaceAndPrincipal(db);
    const txManager = new DrizzleTransactionManager(db);

    const result = await txManager.withTransaction(async (ctx) => {
      const ws = await ctx.workspaces.findById(wsId);
      return ws?.name;
    });

    expect(result).toBe('Default');
  });
});
