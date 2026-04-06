import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Tasks CRUD', () => {
  const actor = 'e2e-agent';
  let projectId: string;
  let taskId: string;
  let taskKey: string;

  it('creates a project for tasks', async () => {
    const res = await client.post('/v0/projects', {
      key: 'TSK',
      name: 'Task Test Project',
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    projectId = res.data.id;
  });

  it('creates a task', async () => {
    const res = await client.post('/v0/tasks', {
      title: 'First E2E task',
      type: 'feature',
      project_id: projectId,
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.title).toBe('First E2E task');
    expect(res.data.type).toBe('feature');
    expect(res.data.status).toBe('open');
    expect(res.data.key).toBe('TSK-1');
    expect(res.data.version).toBe(1);
    expect(res.data.id).toMatch(/^tsk_/);
    taskId = res.data.id;
    taskKey = res.data.key;
  });

  it('creates a second task with auto-incremented key', async () => {
    const res = await client.post('/v0/tasks', {
      title: 'Second E2E task',
      type: 'bug',
      project_id: projectId,
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.key).toBe('TSK-2');
  });

  it('gets task by ID', async () => {
    const res = await client.get(`/v0/tasks/${taskId}`);
    expect(res.status).toBe(200);
    expect(res.data.id).toBe(taskId);
    expect(res.data.title).toBe('First E2E task');
  });

  it('gets task by key', async () => {
    const res = await client.get(`/v0/tasks/${taskKey}`);
    expect(res.status).toBe(200);
    expect(res.data.key).toBe(taskKey);
  });

  it('lists tasks', async () => {
    const res = await client.get('/v0/tasks');
    expect(res.status).toBe(200);
    expect(res.data.items.length).toBeGreaterThanOrEqual(2);
  });

  it('filters tasks by status', async () => {
    const res = await client.get('/v0/tasks', { params: { status: 'open' } });
    expect(res.status).toBe(200);
    for (const task of res.data.items) {
      expect(task.status).toBe('open');
    }
  });

  it('filters tasks by project', async () => {
    const res = await client.get('/v0/tasks', { params: { project_id: projectId } });
    expect(res.status).toBe(200);
    for (const task of res.data.items) {
      expect(task.project_id).toBe(projectId);
    }
  });

  it('returns 404 for unknown task', async () => {
    const res = await client.get('/v0/tasks/tsk_nonexistent');
    expect(res.status).toBe(404);
  });
});
