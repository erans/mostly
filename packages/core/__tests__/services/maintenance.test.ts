import { describe, expect, it, beforeEach } from 'vitest';
import { MaintenanceService } from '../../src/services/maintenance.js';
import { TaskService } from '../../src/services/task.js';
import {
  FakeTaskRepository, FakeTaskUpdateRepository,
  FakeProjectRepository, FakeTransactionManager,
  FakePrincipalRepository, FakeWorkspaceRepository,
  makeWorkspace, makePrincipal,
} from '../../src/test-utils/index.js';

describe('MaintenanceService', () => {
  let maintenanceService: MaintenanceService;
  let taskService: TaskService;
  let taskRepo: FakeTaskRepository;
  const ws = makeWorkspace({ id: '01WS' });
  const actor = makePrincipal({ id: '01ACTOR', workspace_id: ws.id });

  beforeEach(() => {
    taskRepo = new FakeTaskRepository();
    const taskUpdateRepo = new FakeTaskUpdateRepository();
    const projectRepo = new FakeProjectRepository();
    const txManager = new FakeTransactionManager({
      tasks: taskRepo, taskUpdates: taskUpdateRepo, projects: projectRepo,
      principals: new FakePrincipalRepository(), workspaces: new FakeWorkspaceRepository(),
    });
    taskService = new TaskService(taskRepo, taskUpdateRepo, projectRepo, txManager);
    maintenanceService = new MaintenanceService(taskRepo, taskUpdateRepo);
  });

  it('reaps expired claims', async () => {
    const task = await taskService.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
    const past = new Date(Date.now() - 60000).toISOString();
    await taskService.acquireClaim(task.id, actor.id, past, task.version);

    const count = await maintenanceService.reapExpiredClaims(ws.id);
    expect(count).toBe(1);

    const reaped = await taskService.get(task.id);
    expect(reaped.claimed_by_id).toBeNull();
    expect(reaped.claim_expires_at).toBeNull();
    expect(reaped.status).toBe('open');
  });

  it('returns 0 when no expired claims', async () => {
    const count = await maintenanceService.reapExpiredClaims(ws.id);
    expect(count).toBe(0);
  });
});
