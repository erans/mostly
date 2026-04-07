import { describe, expect, it, beforeEach } from 'vitest';
import { createTestApp } from './helpers.js';

describe('Task Update Routes', () => {
  let env: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    env = createTestApp();
  });

  // Helper to create a task
  async function createTask() {
    const res = await env.app.request('/v0/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.testAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Update test task',
        type: 'feature',
        actor_id: env.testPrincipalId,
      }),
    });
    return (await res.json()).data;
  }

  describe('POST /v0/tasks/:id/updates', () => {
    it('creates a task update', async () => {
      const task = await createTask();

      const res = await env.app.request(`/v0/tasks/${task.id}/updates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kind: 'note',
          body: 'This is a progress note',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.kind).toBe('note');
      expect(body.data.body).toBe('This is a progress note');
      expect(body.data.task_id).toBe(task.id);
      expect(body.data.created_by_id).toBe(env.testPrincipalId);
    });

    it('rejects invalid body with 400', async () => {
      const task = await createTask();

      const res = await env.app.request(`/v0/tasks/${task.id}/updates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // missing kind and body
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_argument');
    });
  });

  describe('GET /v0/tasks/:id/updates', () => {
    it('lists updates for a task', async () => {
      const task = await createTask();

      // Add a couple of updates
      for (const note of ['First note', 'Second note']) {
        await env.app.request(`/v0/tasks/${task.id}/updates`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.testAgentToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            kind: 'note',
            body: note,
            actor_id: env.testPrincipalId,
          }),
        });
      }

      const res = await env.app.request(`/v0/tasks/${task.id}/updates`, {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveProperty('items');
      expect(body.data).toHaveProperty('next_cursor');
      expect(Array.isArray(body.data.items)).toBe(true);
      expect(body.data.items.length).toBeGreaterThanOrEqual(2);
    });

    it('supports pagination', async () => {
      const task = await createTask();

      // Add several updates
      for (let i = 0; i < 5; i++) {
        await env.app.request(`/v0/tasks/${task.id}/updates`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.testAgentToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            kind: 'note',
            body: `Note ${i}`,
            actor_id: env.testPrincipalId,
          }),
        });
      }

      const res = await env.app.request(`/v0/tasks/${task.id}/updates?limit=2`, {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.items.length).toBeLessThanOrEqual(2);
    });
  });
});
