import { describe, expect, it, beforeEach } from 'vitest';
import { createTestApp } from './helpers.js';

describe('Maintenance Routes', () => {
  let env: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    env = createTestApp();
  });

  // Helper to create a task
  async function createTask() {
    const res = await env.app.request('/v0/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.testToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Maintenance test task',
        type: 'feature',
        actor_id: env.testPrincipalId,
      }),
    });
    return (await res.json()).data;
  }

  describe('POST /v0/maintenance/reap-expired-claims', () => {
    it('returns reaped count', async () => {
      const res = await env.app.request('/v0/maintenance/reap-expired-claims', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveProperty('reaped');
      expect(typeof body.data.reaped).toBe('number');
    });

    it('reaps expired claims', async () => {
      const task = await createTask();

      // Claim with an already-expired time
      const pastTime = new Date(Date.now() - 60_000).toISOString();
      await env.app.request(`/v0/tasks/${task.id}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_version: task.version,
          claim_expires_at: pastTime,
          actor_id: env.testPrincipalId,
        }),
      });

      // Reap expired claims
      const res = await env.app.request('/v0/maintenance/reap-expired-claims', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.reaped).toBeGreaterThanOrEqual(1);

      // Verify the task's claim was cleared
      const getRes = await env.app.request(`/v0/tasks/${task.id}`, {
        headers: { Authorization: `Bearer ${env.testToken}` },
      });
      const getBody = await getRes.json();
      expect(getBody.data.claimed_by_id).toBeNull();
    });
  });
});
