import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Task updates', () => {
  const actor = 'e2e-agent';
  let projectId: string;
  let taskId: string;

  it('setup: create project and task', async () => {
    projectId = (await client.post('/v0/projects', {
      key: 'UPD', name: 'Update Tests', actor_handle: actor,
    })).data.id;
    taskId = (await client.post('/v0/tasks', {
      title: 'Task with updates', type: 'feature', project_id: projectId, actor_handle: actor,
    })).data.id;
  });

  it('adds a note update', async () => {
    const res = await client.post(`/v0/tasks/${taskId}/updates`, {
      kind: 'note', body: 'This is a test note.', actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.kind).toBe('note');
    expect(res.data.body).toBe('This is a test note.');
    expect(res.data.id).toMatch(/^upd_/);
  });

  it('lists task updates', async () => {
    const res = await client.get(`/v0/tasks/${taskId}/updates`);
    expect(res.status).toBe(200);
    expect(res.data.items.length).toBeGreaterThanOrEqual(1);
    const note = res.data.items.find((u: any) => u.kind === 'note');
    expect(note).toBeDefined();
    expect(note.body).toBe('This is a test note.');
  });

  it('adds multiple updates', async () => {
    await client.post(`/v0/tasks/${taskId}/updates`, {
      kind: 'note', body: 'Second note.', actor_handle: actor,
    });
    await client.post(`/v0/tasks/${taskId}/updates`, {
      kind: 'note', body: 'Third note.', actor_handle: actor,
    });
    const res = await client.get(`/v0/tasks/${taskId}/updates`);
    expect(res.data.items.length).toBeGreaterThanOrEqual(3);
  });
});
