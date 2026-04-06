import { describe, expect, it, beforeEach } from 'vitest';
import { TaskService } from '../../src/services/task.js';
import {
  FakeTaskRepository, FakeTaskUpdateRepository,
  FakeProjectRepository, FakeTransactionManager,
  FakePrincipalRepository, FakeWorkspaceRepository,
  makeWorkspace, makePrincipal,
} from '../../src/test-utils/index.js';

describe('TaskService updates', () => {
  let service: TaskService;
  const ws = makeWorkspace({ id: '01WS' });
  const actor = makePrincipal({ id: '01ACTOR', workspace_id: ws.id });

  beforeEach(() => {
    const taskRepo = new FakeTaskRepository();
    const taskUpdateRepo = new FakeTaskUpdateRepository();
    const projectRepo = new FakeProjectRepository();
    const txManager = new FakeTransactionManager({
      tasks: taskRepo, taskUpdates: taskUpdateRepo, projects: projectRepo,
      principals: new FakePrincipalRepository(), workspaces: new FakeWorkspaceRepository(),
    });
    service = new TaskService(taskRepo, taskUpdateRepo, projectRepo, txManager);
  });

  it('adds a task update', async () => {
    const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
    const update = await service.addUpdate(task.id, {
      kind: 'progress', body: 'Making progress.',
    }, actor.id);
    expect(update.kind).toBe('progress');
    expect(update.body).toBe('Making progress.');
    expect(update.task_id).toBe(task.id);
  });

  it('lists task updates', async () => {
    const task = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
    await service.addUpdate(task.id, { kind: 'note', body: 'First' }, actor.id);
    await service.addUpdate(task.id, { kind: 'note', body: 'Second' }, actor.id);
    const result = await service.listUpdates(task.id);
    expect(result.items.length).toBeGreaterThanOrEqual(2);
  });
});
