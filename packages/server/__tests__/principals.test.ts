import { describe, expect, it, beforeEach } from 'vitest';
import { createTestApp } from './helpers.js';

describe('Principal Routes', () => {
  let env: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    env = createTestApp();
  });

  describe('POST /v0/principals', () => {
    it('creates a principal', async () => {
      const res = await env.app.request('/v0/principals', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          handle: 'bob',
          kind: 'human',
          display_name: 'Bob',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.handle).toBe('bob');
      expect(body.data.kind).toBe('human');
      expect(body.data.display_name).toBe('Bob');
      expect(body.data.is_active).toBe(true);
    });

    it('rejects missing handle with 400', async () => {
      const res = await env.app.request('/v0/principals', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kind: 'human',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_argument');
      expect(body.error.details).toHaveProperty('handle');
    });

    it('rejects invalid kind with 400', async () => {
      const res = await env.app.request('/v0/principals', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          handle: 'charlie',
          kind: 'robot',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_argument');
    });

    it('rejects duplicate handle with 400', async () => {
      // First create
      await env.app.request('/v0/principals', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          handle: 'duplicate-user',
          kind: 'human',
          actor_id: env.testPrincipalId,
        }),
      });

      // Second create with same handle
      const res = await env.app.request('/v0/principals', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          handle: 'duplicate-user',
          kind: 'human',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_argument');
    });
  });

  describe('GET /v0/principals/:id', () => {
    it('returns principal by ULID', async () => {
      const res = await env.app.request(`/v0/principals/${env.testPrincipalId}`, {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(env.testPrincipalId);
    });

    it('returns principal by handle', async () => {
      const res = await env.app.request(`/v0/principals/${env.testPrincipalHandle}`, {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.handle).toBe(env.testPrincipalHandle);
    });

    it('returns 404 for non-existent principal', async () => {
      const res = await env.app.request('/v0/principals/nonexistent-handle', {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('not_found');
    });
  });

  describe('PATCH /v0/principals/:id', () => {
    it('updates a principal', async () => {
      const res = await env.app.request(`/v0/principals/${env.testPrincipalId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          display_name: 'Updated Name',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.display_name).toBe('Updated Name');
    });

    it('updates a principal by handle', async () => {
      const res = await env.app.request(`/v0/principals/${env.testPrincipalHandle}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          display_name: 'Handle Updated',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.display_name).toBe('Handle Updated');
    });
  });

  describe('GET /v0/principals', () => {
    it('lists principals', async () => {
      const res = await env.app.request('/v0/principals', {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveProperty('items');
      expect(body.data).toHaveProperty('next_cursor');
      expect(Array.isArray(body.data.items)).toBe(true);
      expect(body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('supports cursor pagination query params', async () => {
      // Create a few more principals so there are multiple
      for (let i = 0; i < 3; i++) {
        await env.app.request('/v0/principals', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.testAgentToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            handle: `pagination-user-${i}`,
            kind: 'human',
            actor_id: env.testPrincipalId,
          }),
        });
      }

      const res = await env.app.request('/v0/principals?limit=2', {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.items.length).toBeLessThanOrEqual(2);
    });
  });
});
