import { describe, expect, it, beforeEach } from 'vitest';
import { createTestApp } from './helpers.js';

describe('Task Claim Routes', () => {
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
        title: 'Claim test task',
        type: 'feature',
        actor_id: env.testPrincipalId,
        ...overrides,
      }),
    });
    return (await res.json()).data;
  }

  // Helper to create a second principal
  async function createSecondPrincipal() {
    const res = await env.app.request('/v0/principals', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.testAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        handle: 'other-agent',
        kind: 'agent',
        display_name: 'Other Agent',
        actor_id: env.testPrincipalId,
      }),
    });
    return (await res.json()).data;
  }

  describe('POST /v0/tasks/:id/claim', () => {
    it('acquires claim on an open task', async () => {
      const task = await createTask();

      const res = await env.app.request(`/v0/tasks/${task.id}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_version: task.version,
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('claimed');
      expect(body.data.claimed_by_id).toBe(env.testPrincipalId);
    });

    it('rejects if already claimed with 412', async () => {
      const task = await createTask();

      // First claim
      await env.app.request(`/v0/tasks/${task.id}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_version: task.version,
          actor_id: env.testPrincipalId,
        }),
      });

      // Second claim by different actor - version will be 2 now
      const other = await createSecondPrincipal();
      const res = await env.app.request(`/v0/tasks/${task.id}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_version: 2,
          actor_id: other.id,
        }),
      });
      expect(res.status).toBe(412);
      const body = await res.json();
      expect(body.error.code).toBe('precondition_failed');
    });
  });

  describe('POST /v0/tasks/:id/renew-claim', () => {
    it('renews claim', async () => {
      const task = await createTask();

      // Acquire claim first
      const claimRes = await env.app.request(`/v0/tasks/${task.id}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_version: task.version,
          claim_expires_at: new Date(Date.now() + 60_000).toISOString(),
          actor_id: env.testPrincipalId,
        }),
      });
      const claimed = (await claimRes.json()).data;

      // Renew
      const newExpiry = new Date(Date.now() + 120_000).toISOString();
      const res = await env.app.request(`/v0/tasks/${task.id}/renew-claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_version: claimed.version,
          claim_expires_at: newExpiry,
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.claim_expires_at).toBe(newExpiry);
    });

    it('rejects non-claimer with 412', async () => {
      const task = await createTask();

      // Acquire claim
      await env.app.request(`/v0/tasks/${task.id}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_version: task.version,
          actor_id: env.testPrincipalId,
        }),
      });

      // Try to renew as different actor
      const other = await createSecondPrincipal();
      const res = await env.app.request(`/v0/tasks/${task.id}/renew-claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_version: 2,
          actor_id: other.id,
        }),
      });
      expect(res.status).toBe(412);
      const body = await res.json();
      expect(body.error.code).toBe('precondition_failed');
    });
  });

  describe('POST /v0/tasks/:id/release-claim', () => {
    it('releases claim', async () => {
      const task = await createTask();

      // Acquire claim
      const claimRes = await env.app.request(`/v0/tasks/${task.id}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_version: task.version,
          actor_id: env.testPrincipalId,
        }),
      });
      const claimed = (await claimRes.json()).data;

      // Release
      const res = await env.app.request(`/v0/tasks/${task.id}/release-claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_version: claimed.version,
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.claimed_by_id).toBeNull();
      expect(body.data.status).toBe('open');
    });

    it('rejects non-claimer with 412', async () => {
      const task = await createTask();

      // Acquire claim
      await env.app.request(`/v0/tasks/${task.id}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_version: task.version,
          actor_id: env.testPrincipalId,
        }),
      });

      // Try to release as different actor
      const other = await createSecondPrincipal();
      const res = await env.app.request(`/v0/tasks/${task.id}/release-claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_version: 2,
          actor_id: other.id,
        }),
      });
      expect(res.status).toBe(412);
      const body = await res.json();
      expect(body.error.code).toBe('precondition_failed');
    });
  });
});
