import { describe, expect, it, beforeEach } from 'vitest';
import { TaskService } from '../../src/services/task.js';
import {
  FakeTaskRepository, FakeTaskUpdateRepository,
  FakeProjectRepository, FakeTransactionManager,
  FakePrincipalRepository, FakeWorkspaceRepository,
  makeWorkspace, makePrincipal,
} from '../../src/test-utils/index.js';
import { PreconditionFailedError } from '@mostly/types';

describe('TaskService claims', () => {
  let service: TaskService;
  let taskRepo: FakeTaskRepository;
  const ws = makeWorkspace({ id: '01WS' });
  const actor = makePrincipal({ id: '01ACTOR', workspace_id: ws.id });
  const other = makePrincipal({ id: '01OTHER', workspace_id: ws.id });

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

  describe('acquireClaim', () => {
    it('acquires claim on open task, status becomes claimed', async () => {
      const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
      const claimed = await service.acquireClaim(task.id, actor.id, null, task.version);
      expect(claimed.claimed_by_id).toBe(actor.id);
      expect(claimed.status).toBe('claimed');
      expect(claimed.version).toBe(2);
    });

    it('acquires claim with expiry', async () => {
      const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
      const future = new Date(Date.now() + 3600000).toISOString();
      const claimed = await service.acquireClaim(task.id, actor.id, future, task.version);
      expect(claimed.claim_expires_at).toBe(future);
    });

    it('fails when task already has active claim', async () => {
      const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
      await service.acquireClaim(task.id, actor.id, null, task.version);
      const fresh = await service.get(task.id);
      await expect(service.acquireClaim(fresh.id, other.id, null, fresh.version))
        .rejects.toThrow(PreconditionFailedError);
    });

    it('fails on terminal task', async () => {
      const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
      const closed = await service.transition(task.id, 'closed', 'completed', task.version, actor.id);
      await expect(service.acquireClaim(closed.id, actor.id, null, closed.version))
        .rejects.toThrow(PreconditionFailedError);
    });

    it('acquires on blocked task (status stays blocked)', async () => {
      const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
      const claimed = await service.acquireClaim(task.id, actor.id, null, task.version);
      const inProgress = await service.transition(claimed.id, 'in_progress', null, claimed.version, actor.id);
      const blocked = await service.transition(inProgress.id, 'blocked', null, inProgress.version, actor.id);
      const released = await service.releaseClaim(blocked.id, actor.id, blocked.version);
      expect(released.status).toBe('blocked');
      const reClaimed = await service.acquireClaim(released.id, other.id, null, released.version);
      expect(reClaimed.status).toBe('blocked');
      expect(reClaimed.claimed_by_id).toBe(other.id);
    });
  });

  describe('renewClaim', () => {
    it('renews claim with new expiry', async () => {
      const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
      const claimed = await service.acquireClaim(task.id, actor.id, null, task.version);
      const future = new Date(Date.now() + 7200000).toISOString();
      const renewed = await service.renewClaim(claimed.id, actor.id, future, claimed.version);
      expect(renewed.claim_expires_at).toBe(future);
      expect(renewed.version).toBe(3);
    });

    it('fails when actor is not claimer', async () => {
      const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
      const claimed = await service.acquireClaim(task.id, actor.id, null, task.version);
      await expect(service.renewClaim(claimed.id, other.id, null, claimed.version))
        .rejects.toThrow(PreconditionFailedError);
    });
  });

  describe('releaseClaim', () => {
    it('releases claim, status becomes open', async () => {
      const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
      const claimed = await service.acquireClaim(task.id, actor.id, null, task.version);
      const released = await service.releaseClaim(claimed.id, actor.id, claimed.version);
      expect(released.claimed_by_id).toBeNull();
      expect(released.claim_expires_at).toBeNull();
      expect(released.status).toBe('open');
    });

    it('releases claim on in_progress, status becomes open', async () => {
      const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
      const claimed = await service.acquireClaim(task.id, actor.id, null, task.version);
      const inProgress = await service.transition(claimed.id, 'in_progress', null, claimed.version, actor.id);
      const released = await service.releaseClaim(inProgress.id, actor.id, inProgress.version);
      expect(released.status).toBe('open');
    });

    it('releases claim on blocked, status stays blocked', async () => {
      const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
      const claimed = await service.acquireClaim(task.id, actor.id, null, task.version);
      const inProgress = await service.transition(claimed.id, 'in_progress', null, claimed.version, actor.id);
      const blocked = await service.transition(inProgress.id, 'blocked', null, inProgress.version, actor.id);
      const released = await service.releaseClaim(blocked.id, actor.id, blocked.version);
      expect(released.status).toBe('blocked');
      expect(released.claimed_by_id).toBeNull();
    });

    it('fails when actor is not claimer', async () => {
      const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
      const claimed = await service.acquireClaim(task.id, actor.id, null, task.version);
      await expect(service.releaseClaim(claimed.id, other.id, claimed.version))
        .rejects.toThrow(PreconditionFailedError);
    });
  });
});
