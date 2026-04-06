import { describe, expect, it, beforeEach } from 'vitest';
import { TaskService } from '../../src/services/task.js';
import {
  FakeTaskRepository, FakeTaskUpdateRepository,
  FakeProjectRepository, FakeTransactionManager,
  FakePrincipalRepository, FakeWorkspaceRepository,
  makeWorkspace, makePrincipal,
} from '../../src/test-utils/index.js';
import { PreconditionFailedError } from '@mostly/types';

describe('TaskService transitions', () => {
  let service: TaskService;
  let taskRepo: FakeTaskRepository;
  const ws = makeWorkspace({ id: '01WS' });
  const actor = makePrincipal({ id: '01ACTOR', workspace_id: ws.id });

  beforeEach(() => {
    taskRepo = new FakeTaskRepository();
    const taskUpdateRepo = new FakeTaskUpdateRepository();
    const projectRepo = new FakeProjectRepository();
    const txManager = new FakeTransactionManager({
      tasks: taskRepo,
      taskUpdates: taskUpdateRepo,
      projects: projectRepo,
      principals: new FakePrincipalRepository(),
      workspaces: new FakeWorkspaceRepository(),
    });
    service = new TaskService(taskRepo, taskUpdateRepo, projectRepo, txManager);
  });

  it('open -> closed with completed', async () => {
    const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
    const closed = await service.transition(task.id, 'closed', 'completed', task.version, actor.id);
    expect(closed.status).toBe('closed');
    expect(closed.resolution).toBe('completed');
    expect(closed.resolved_at).toBeTruthy();
    expect(closed.version).toBe(2);
  });

  it('open -> canceled with wont_do', async () => {
    const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
    const canceled = await service.transition(task.id, 'canceled', 'wont_do', task.version, actor.id);
    expect(canceled.status).toBe('canceled');
    expect(canceled.resolution).toBe('wont_do');
  });

  it('open -> closed without resolution fails', async () => {
    const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
    await expect(service.transition(task.id, 'closed', null, task.version, actor.id))
      .rejects.toThrow(PreconditionFailedError);
  });

  it('open -> closed with wrong resolution fails', async () => {
    const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
    await expect(service.transition(task.id, 'closed', 'wont_do', task.version, actor.id))
      .rejects.toThrow(PreconditionFailedError);
  });

  it('open -> in_progress fails (must go through claimed)', async () => {
    const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
    await expect(service.transition(task.id, 'in_progress', null, task.version, actor.id))
      .rejects.toThrow(PreconditionFailedError);
  });

  it('claimed -> in_progress', async () => {
    const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
    const claimed = await service.acquireClaim(task.id, actor.id, null, task.version);
    const inProgress = await service.transition(claimed.id, 'in_progress', null, claimed.version, actor.id);
    expect(inProgress.status).toBe('in_progress');
  });

  it('in_progress -> closed releases claim atomically', async () => {
    const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
    const claimed = await service.acquireClaim(task.id, actor.id, null, task.version);
    const inProgress = await service.transition(claimed.id, 'in_progress', null, claimed.version, actor.id);
    const closed = await service.transition(inProgress.id, 'closed', 'completed', inProgress.version, actor.id);
    expect(closed.status).toBe('closed');
    expect(closed.claimed_by_id).toBeNull();
    expect(closed.claim_expires_at).toBeNull();
  });

  it('in_progress -> closed by non-claimer fails', async () => {
    const other = makePrincipal({ id: '01OTHER', workspace_id: ws.id });
    const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
    const claimed = await service.acquireClaim(task.id, actor.id, null, task.version);
    const inProgress = await service.transition(claimed.id, 'in_progress', null, claimed.version, actor.id);
    await expect(service.transition(inProgress.id, 'closed', 'completed', inProgress.version, other.id))
      .rejects.toThrow(PreconditionFailedError);
  });

  it('closed cannot transition', async () => {
    const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
    const closed = await service.transition(task.id, 'closed', 'completed', task.version, actor.id);
    await expect(service.transition(closed.id, 'open', null, closed.version, actor.id))
      .rejects.toThrow(PreconditionFailedError);
  });

  it('canceled cannot transition', async () => {
    const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
    const canceled = await service.transition(task.id, 'canceled', 'wont_do', task.version, actor.id);
    await expect(service.transition(canceled.id, 'open', null, canceled.version, actor.id))
      .rejects.toThrow(PreconditionFailedError);
  });
});
