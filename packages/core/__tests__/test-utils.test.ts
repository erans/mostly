import { describe, expect, it } from 'vitest';
import {
  makeWorkspace,
  makePrincipal,
  makeProject,
  makeTask,
  FakeWorkspaceRepository,
  FakePrincipalRepository,
  FakeProjectRepository,
  FakeTaskRepository,
  FakeTaskUpdateRepository,
  FakeTransactionManager,
} from '../src/test-utils/index.js';

describe('factories', () => {
  it('makeWorkspace creates a valid workspace', () => {
    const ws = makeWorkspace();
    expect(ws.id).toBeTruthy();
    expect(ws.slug).toBe('default');
  });

  it('makePrincipal creates a valid principal', () => {
    const p = makePrincipal({ handle: 'eran' });
    expect(p.handle).toBe('eran');
    expect(p.kind).toBe('human');
  });

  it('makeProject creates a valid project', () => {
    const p = makeProject({ key: 'AUTH' });
    expect(p.key).toBe('AUTH');
  });

  it('makeTask creates a valid task', () => {
    const t = makeTask({ status: 'claimed', claimed_by_id: '01A' });
    expect(t.status).toBe('claimed');
    expect(t.claimed_by_id).toBe('01A');
  });
});

describe('FakeTaskRepository', () => {
  it('create and findById round-trips', async () => {
    const repo = new FakeTaskRepository();
    const task = makeTask();
    await repo.create({
      id: task.id, workspace_id: task.workspace_id, project_id: null,
      key: task.key, type: task.type, title: task.title, description: null,
      status: 'open', resolution: null, assignee_id: null,
      claimed_by_id: null, claim_expires_at: null, version: 1,
      created_by_id: task.created_by_id, updated_by_id: task.updated_by_id,
      resolved_at: null, created_at: task.created_at, updated_at: task.updated_at,
    });
    const found = await repo.findById(task.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(task.id);
  });

  it('update with wrong version throws ConflictError', async () => {
    const repo = new FakeTaskRepository();
    const task = makeTask();
    await repo.create({
      id: task.id, workspace_id: task.workspace_id, project_id: null,
      key: task.key, type: task.type, title: task.title, description: null,
      status: 'open', resolution: null, assignee_id: null,
      claimed_by_id: null, claim_expires_at: null, version: 1,
      created_by_id: task.created_by_id, updated_by_id: task.updated_by_id,
      resolved_at: null, created_at: task.created_at, updated_at: task.updated_at,
    });
    await expect(repo.update(task.id, {
      title: 'Updated',
      version: 2,
      updated_by_id: '01A',
      updated_at: new Date().toISOString(),
    }, 99)).rejects.toThrow('version mismatch');
  });

  it('nextKeyNumber allocates monotonically', async () => {
    const repo = new FakeTaskRepository();
    expect(await repo.nextKeyNumber('01WS', 'AUTH')).toBe(1);
    expect(await repo.nextKeyNumber('01WS', 'AUTH')).toBe(2);
    expect(await repo.nextKeyNumber('01WS', 'TASK')).toBe(1);
  });
});

describe('FakeTransactionManager', () => {
  it('executes callback with same repos', async () => {
    const taskRepo = new FakeTaskRepository();
    const txManager = new FakeTransactionManager({
      tasks: taskRepo,
      taskUpdates: new FakeTaskUpdateRepository(),
      projects: new FakeProjectRepository(),
      principals: new FakePrincipalRepository(),
      workspaces: new FakeWorkspaceRepository(),
    });
    const result = await txManager.withTransaction(async (ctx) => {
      return ctx.tasks === taskRepo;
    });
    expect(result).toBe(true);
  });
});
