import { describe, expect, it, beforeEach } from 'vitest';
import { createTestApp } from './helpers.js';

describe('Project Routes', () => {
  let env: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    env = createTestApp();
  });

  describe('POST /v0/projects', () => {
    it('creates a project', async () => {
      const res = await env.app.request('/v0/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: 'AUTH',
          name: 'Auth Service',
          description: 'Authentication project',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.key).toBe('AUTH');
      expect(body.data.name).toBe('Auth Service');
      expect(body.data.description).toBe('Authentication project');
      expect(body.data.is_archived).toBe(false);
    });

    it('rejects missing key with 400', async () => {
      const res = await env.app.request('/v0/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'No Key Project',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_argument');
      expect(body.error.details).toHaveProperty('key');
    });

    it('rejects missing name with 400', async () => {
      const res = await env.app.request('/v0/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: 'NONAME',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_argument');
    });

    it('rejects lowercase key with 400', async () => {
      const res = await env.app.request('/v0/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: 'lowercase',
          name: 'Bad Key Project',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_argument');
    });

    it('rejects duplicate key with 400', async () => {
      // First create
      await env.app.request('/v0/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: 'DUPKEY',
          name: 'First Project',
          actor_id: env.testPrincipalId,
        }),
      });

      // Second create with same key
      const res = await env.app.request('/v0/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: 'DUPKEY',
          name: 'Duplicate Project',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_argument');
    });
  });

  describe('GET /v0/projects/:id', () => {
    async function createProject(key: string, name: string) {
      const res = await env.app.request('/v0/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
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

    it('returns project by ULID', async () => {
      const project = await createProject('BYID', 'By ID Project');
      const res = await env.app.request(`/v0/projects/${project.id}`, {
        headers: { Authorization: `Bearer ${env.testToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(project.id);
    });

    it('returns project by key', async () => {
      await createProject('BYKEY', 'By Key Project');
      const res = await env.app.request('/v0/projects/BYKEY', {
        headers: { Authorization: `Bearer ${env.testToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.key).toBe('BYKEY');
    });

    it('returns 404 for non-existent project', async () => {
      const res = await env.app.request('/v0/projects/NONEXISTENT', {
        headers: { Authorization: `Bearer ${env.testToken}` },
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('not_found');
    });
  });

  describe('PATCH /v0/projects/:id', () => {
    async function createProject(key: string, name: string) {
      const res = await env.app.request('/v0/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
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

    it('updates a project by ULID', async () => {
      const project = await createProject('UPDT', 'Update Test');
      const res = await env.app.request(`/v0/projects/${project.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Updated Name',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe('Updated Name');
    });

    it('updates a project by key', async () => {
      await createProject('UPDTKEY', 'Update Key Test');
      const res = await env.app.request('/v0/projects/UPDTKEY', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'New description',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.description).toBe('New description');
    });

    it('archives a project', async () => {
      const project = await createProject('ARCH', 'Archive Test');
      const res = await env.app.request(`/v0/projects/${project.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_archived: true,
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.is_archived).toBe(true);
    });
  });

  describe('GET /v0/projects', () => {
    it('lists projects', async () => {
      // Create a project first
      await env.app.request('/v0/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: 'LISTTEST',
          name: 'List Test',
          actor_id: env.testPrincipalId,
        }),
      });

      const res = await env.app.request('/v0/projects', {
        headers: { Authorization: `Bearer ${env.testToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveProperty('items');
      expect(body.data).toHaveProperty('next_cursor');
      expect(Array.isArray(body.data.items)).toBe(true);
      expect(body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('supports cursor and limit params', async () => {
      // Create several projects
      for (let i = 0; i < 3; i++) {
        await env.app.request('/v0/projects', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.testToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: `PGTEST${i}`,
            name: `Pagination Test ${i}`,
            actor_id: env.testPrincipalId,
          }),
        });
      }

      const res = await env.app.request('/v0/projects?limit=2', {
        headers: { Authorization: `Bearer ${env.testToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.items.length).toBeLessThanOrEqual(2);
    });
  });
});
