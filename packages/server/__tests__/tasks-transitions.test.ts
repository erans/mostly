import { describe, expect, it, beforeEach } from 'vitest';
import { createTestApp } from './helpers.js';

describe('Task Transition Routes', () => {
  let env: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    env = createTestApp();
  });

  // Helper to create a task
  async function createTask(overrides: Record<string, unknown> = {}) {
    const res = await env.app.request('/v0/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.testToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Transition test task',
        type: 'feature',
        actor_id: env.testPrincipalId,
        ...overrides,
      }),
    });
    return (await res.json()).data;
  }

  // Helper to claim a task (open -> claimed)
  async function claimTask(taskId: string, version: number) {
    const res = await env.app.request(`/v0/tasks/${taskId}/claim`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.testToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expected_version: version,
        actor_id: env.testPrincipalId,
      }),
    });
    return (await res.json()).data;
  }

  describe('POST /v0/tasks/:id/transition', () => {
    it('transitions claimed -> in_progress', async () => {
      const task = await createTask();
      const claimed = await claimTask(task.id, task.version);

      const res = await env.app.request(`/v0/tasks/${task.id}/transition`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to_status: 'in_progress',
          expected_version: claimed.version,
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('in_progress');
    });

    it('transitions to closed with resolution', async () => {
      const task = await createTask();
      const claimed = await claimTask(task.id, task.version);

      // claimed -> in_progress
      const transRes = await env.app.request(`/v0/tasks/${task.id}/transition`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to_status: 'in_progress',
          expected_version: claimed.version,
          actor_id: env.testPrincipalId,
        }),
      });
      const inProgress = (await transRes.json()).data;

      // in_progress -> closed
      const res = await env.app.request(`/v0/tasks/${task.id}/transition`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to_status: 'closed',
          resolution: 'completed',
          expected_version: inProgress.version,
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('closed');
      expect(body.data.resolution).toBe('completed');
      expect(body.data.resolved_at).not.toBeNull();
    });

    it('rejects invalid transition with 412', async () => {
      const task = await createTask();

      // open -> in_progress is invalid (must claim first)
      const res = await env.app.request(`/v0/tasks/${task.id}/transition`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to_status: 'in_progress',
          expected_version: task.version,
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(412);
      const body = await res.json();
      expect(body.error.code).toBe('precondition_failed');
    });

    it('rejects wrong version with 409', async () => {
      const task = await createTask();
      const claimed = await claimTask(task.id, task.version);

      const res = await env.app.request(`/v0/tasks/${task.id}/transition`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to_status: 'in_progress',
          expected_version: 1, // stale version
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('conflict');
    });
  });
});
