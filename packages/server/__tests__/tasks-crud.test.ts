import { describe, expect, it, beforeEach } from 'vitest';
import { createTestApp } from './helpers.js';

describe('Task CRUD Routes', () => {
  let env: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    env = createTestApp();
  });

  // Helper to create a task
  async function createTask(overrides: Record<string, unknown> = {}) {
    const res = await env.app.request('/v0/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.testAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Test task',
        type: 'feature',
        actor_id: env.testPrincipalId,
        ...overrides,
      }),
    });
    return res;
  }

  // Helper to create a project
  async function createProject(key: string, name: string) {
    const res = await env.app.request('/v0/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.testAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key,
        name,
        actor_id: env.testPrincipalId,
      }),
    });
    return (await res.json()).data;
  }

  describe('POST /v0/tasks', () => {
    it('creates a task', async () => {
      const res = await createTask();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.title).toBe('Test task');
      expect(body.data.type).toBe('feature');
      expect(body.data.status).toBe('open');
      expect(body.data.key).toMatch(/^TASK-\d+$/);
      expect(body.data.version).toBe(1);
    });

    it('creates task with project (key uses project prefix)', async () => {
      const project = await createProject('AUTH', 'Auth Service');
      const res = await createTask({ project_id: project.id });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.key).toMatch(/^AUTH-\d+$/);
      expect(body.data.project_id).toBe(project.id);
    });

    it('rejects missing required fields with 400', async () => {
      const res = await env.app.request('/v0/tasks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actor_id: env.testPrincipalId,
          // missing title and type
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_argument');
    });
  });

  describe('GET /v0/tasks/:id', () => {
    it('returns task by ULID', async () => {
      const createRes = await createTask();
      const created = (await createRes.json()).data;

      const res = await env.app.request(`/v0/tasks/${created.id}`, {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(created.id);
      expect(body.data.title).toBe('Test task');
    });

    it('returns task by key', async () => {
      const createRes = await createTask();
      const created = (await createRes.json()).data;

      const res = await env.app.request(`/v0/tasks/${created.key}`, {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.key).toBe(created.key);
    });

    it('returns 404 for non-existent task', async () => {
      const res = await env.app.request('/v0/tasks/NONEXISTENT-999', {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('not_found');
    });
  });

  describe('PATCH /v0/tasks/:id', () => {
    it('updates task fields', async () => {
      const createRes = await createTask();
      const created = (await createRes.json()).data;

      const res = await env.app.request(`/v0/tasks/${created.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Updated title',
          expected_version: 1,
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.title).toBe('Updated title');
      expect(body.data.version).toBe(2);
    });

    it('rejects wrong version with 409', async () => {
      const createRes = await createTask();
      const created = (await createRes.json()).data;

      const res = await env.app.request(`/v0/tasks/${created.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Should fail',
          expected_version: 99,
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('conflict');
    });
  });

  describe('GET /v0/tasks', () => {
    it('lists tasks', async () => {
      await createTask({ title: 'Task A' });
      await createTask({ title: 'Task B' });

      const res = await env.app.request('/v0/tasks', {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveProperty('items');
      expect(body.data).toHaveProperty('next_cursor');
      expect(Array.isArray(body.data.items)).toBe(true);
      expect(body.data.items.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by status', async () => {
      await createTask({ title: 'Open task' });

      const res = await env.app.request('/v0/tasks?status=open', {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.items.length).toBeGreaterThanOrEqual(1);
      for (const item of body.data.items) {
        expect(item.status).toBe('open');
      }
    });

    it('filters by assignee', async () => {
      await createTask({ title: 'Assigned task', assignee_id: env.testPrincipalId });
      await createTask({ title: 'Unassigned task' });

      const res = await env.app.request(`/v0/tasks?assignee_id=${env.testPrincipalId}`, {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.items.length).toBeGreaterThanOrEqual(1);
      for (const item of body.data.items) {
        expect(item.assignee_id).toBe(env.testPrincipalId);
      }
    });

    it('filters by project', async () => {
      const project = await createProject('FLTR', 'Filter Project');
      await createTask({ title: 'Project task', project_id: project.id });
      await createTask({ title: 'No project task' });

      const res = await env.app.request(`/v0/tasks?project_id=${project.id}`, {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.items.length).toBeGreaterThanOrEqual(1);
      for (const item of body.data.items) {
        expect(item.project_id).toBe(project.id);
      }
    });
  });
});
