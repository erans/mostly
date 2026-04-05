import { describe, expect, it, beforeEach } from 'vitest';
import { TaskService } from '../../src/services/task.js';
import {
  FakeTaskRepository, FakeTaskUpdateRepository,
  FakeProjectRepository, FakeTransactionManager,
  FakePrincipalRepository, FakeWorkspaceRepository,
  makeWorkspace, makePrincipal, makeProject,
} from '../../src/test-utils/index.js';
import { NotFoundError, ConflictError } from '@mostly/types';

describe('TaskService CRUD', () => {
  let service: TaskService;
  let taskRepo: FakeTaskRepository;
  let taskUpdateRepo: FakeTaskUpdateRepository;
  let projectRepo: FakeProjectRepository;
  const ws = makeWorkspace({ id: '01WS' });
  const actor = makePrincipal({ id: '01ACTOR', workspace_id: ws.id });

  beforeEach(() => {
    taskRepo = new FakeTaskRepository();
    taskUpdateRepo = new FakeTaskUpdateRepository();
    projectRepo = new FakeProjectRepository();
    const txManager = new FakeTransactionManager({
      tasks: taskRepo,
      taskUpdates: taskUpdateRepo,
      projects: projectRepo,
      principals: new FakePrincipalRepository(),
      workspaces: new FakeWorkspaceRepository(),
    });
    service = new TaskService(taskRepo, taskUpdateRepo, projectRepo, txManager);
  });

  describe('create', () => {
    it('creates a task with TASK prefix when no project', async () => {
      const task = await service.create(ws.id, {
        type: 'bug', title: 'Fix login',
      }, actor.id);
      expect(task.key).toBe('TASK-1');
      expect(task.status).toBe('open');
      expect(task.version).toBe(1);
      expect(task.created_by_id).toBe(actor.id);
    });

    it('creates a task with project key prefix', async () => {
      const project = makeProject({ id: '01P', workspace_id: ws.id, key: 'AUTH' });
      await projectRepo.create({
        id: project.id, workspace_id: project.workspace_id, key: project.key,
        name: project.name, description: null, is_archived: false,
        created_by_id: actor.id, updated_by_id: actor.id,
        created_at: project.created_at, updated_at: project.updated_at,
      });

      const task = await service.create(ws.id, {
        type: 'feature', title: 'Add OAuth', project_id: project.id,
      }, actor.id);
      expect(task.key).toBe('AUTH-1');
      expect(task.project_id).toBe(project.id);
    });

    it('allocates keys monotonically', async () => {
      const t1 = await service.create(ws.id, { type: 'bug', title: 'First' }, actor.id);
      const t2 = await service.create(ws.id, { type: 'bug', title: 'Second' }, actor.id);
      expect(t1.key).toBe('TASK-1');
      expect(t2.key).toBe('TASK-2');
    });
  });

  describe('get', () => {
    it('returns task by id', async () => {
      const created = await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
      const found = await service.get(created.id);
      expect(found.id).toBe(created.id);
    });

    it('throws NotFoundError for missing id', async () => {
      await expect(service.get('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getByKey', () => {
    it('returns task by key', async () => {
      await service.create(ws.id, { type: 'bug', title: 'Fix' }, actor.id);
      const found = await service.getByKey(ws.id, 'TASK-1');
      expect(found.title).toBe('Fix');
    });
  });

  describe('list', () => {
    it('returns tasks for workspace', async () => {
      await service.create(ws.id, { type: 'bug', title: 'A' }, actor.id);
      await service.create(ws.id, { type: 'bug', title: 'B' }, actor.id);
      const result = await service.list(ws.id, {});
      expect(result.items).toHaveLength(2);
    });

    it('filters by status', async () => {
      await service.create(ws.id, { type: 'bug', title: 'A' }, actor.id);
      const result = await service.list(ws.id, { status: 'claimed' });
      expect(result.items).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('updates title and increments version', async () => {
      const created = await service.create(ws.id, { type: 'bug', title: 'Old' }, actor.id);
      const updated = await service.update(created.id, { title: 'New' }, created.version, actor.id);
      expect(updated.title).toBe('New');
      expect(updated.version).toBe(2);
    });

    it('rejects wrong expected_version', async () => {
      const created = await service.create(ws.id, { type: 'bug', title: 'Old' }, actor.id);
      await expect(service.update(created.id, { title: 'New' }, 99, actor.id))
        .rejects.toThrow(ConflictError);
    });
  });
});
