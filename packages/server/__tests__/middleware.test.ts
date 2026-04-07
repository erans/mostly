import { describe, expect, it, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { NotFoundError, InvalidArgumentError, ConflictError, PreconditionFailedError, DomainError } from '@mostly/types';
import { createTestApp } from './helpers.js';
import { errorHandler } from '../src/middleware/errors.js';
import { authMiddleware } from '../src/middleware/auth.js';
import type { AppEnv } from '../src/app.js';

describe('auth middleware', () => {
  it('rejects requests without any authentication', async () => {
    const { app } = createTestApp();
    app.get('/v0/test', (c) => c.json({ ok: true }));

    const res = await app.request('/v0/test');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.message).toContain('Authentication required');
  });

  it('rejects requests with invalid bearer token', async () => {
    const { app } = createTestApp();
    app.get('/v0/test', (c) => c.json({ ok: true }));

    const res = await app.request('/v0/test', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  it('rejects requests with malformed Authorization header', async () => {
    const { app } = createTestApp();
    app.get('/v0/test', (c) => c.json({ ok: true }));

    const res = await app.request('/v0/test', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(res.status).toBe(401);
  });

  it('passes requests with valid agent token', async () => {
    const { app, testAgentToken } = createTestApp();
    app.get('/v0/test', (c) => c.json({ ok: true }));

    const res = await app.request('/v0/test', {
      headers: { Authorization: `Bearer ${testAgentToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe('error middleware', () => {
  it('maps NotFoundError to 404', async () => {
    const { app, testAgentToken } = createTestApp();
    app.get('/v0/test', () => {
      throw new NotFoundError('thing', '123');
    });

    const res = await app.request('/v0/test', {
      headers: { Authorization: `Bearer ${testAgentToken}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toContain('thing not found');
  });

  it('maps InvalidArgumentError to 400', async () => {
    const { app, testAgentToken } = createTestApp();
    app.get('/v0/test', () => {
      throw new InvalidArgumentError('bad input');
    });

    const res = await app.request('/v0/test', {
      headers: { Authorization: `Bearer ${testAgentToken}` },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_argument');
    expect(body.error.message).toBe('bad input');
  });

  it('maps ConflictError to 409', async () => {
    const { app, testAgentToken } = createTestApp();
    app.get('/v0/test', () => {
      throw new ConflictError('already exists');
    });

    const res = await app.request('/v0/test', {
      headers: { Authorization: `Bearer ${testAgentToken}` },
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('conflict');
  });

  it('maps PreconditionFailedError to 412', async () => {
    const { app, testAgentToken } = createTestApp();
    app.get('/v0/test', () => {
      throw new PreconditionFailedError('version mismatch');
    });

    const res = await app.request('/v0/test', {
      headers: { Authorization: `Bearer ${testAgentToken}` },
    });
    expect(res.status).toBe(412);
    const body = await res.json();
    expect(body.error.code).toBe('precondition_failed');
  });

  it('maps unknown errors to 500', async () => {
    const { app, testAgentToken } = createTestApp();
    app.get('/v0/test', () => {
      throw new Error('something broke');
    });

    const res = await app.request('/v0/test', {
      headers: { Authorization: `Bearer ${testAgentToken}` },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('internal_error');
    expect(body.error.message).toBe('Internal server error');
  });

  it('returns JSON error format with code and message', async () => {
    const { app, testAgentToken } = createTestApp();
    app.get('/v0/test', () => {
      throw new NotFoundError('widget', 'abc');
    });

    const res = await app.request('/v0/test', {
      headers: { Authorization: `Bearer ${testAgentToken}` },
    });
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
    expect(typeof body.error.code).toBe('string');
    expect(typeof body.error.message).toBe('string');
  });
});

describe('actor middleware', () => {
  it('requires actor_id or actor_handle on POST for agent auth', async () => {
    const { app, testAgentToken } = createTestApp();
    app.post('/v0/test', (c) => c.json({ ok: true }));

    const res = await app.request('/v0/test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'hello' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_argument');
    expect(body.error.message).toContain('actor_id or actor_handle');
  });

  it('resolves actor by actor_id on POST', async () => {
    const { app, testAgentToken, testPrincipalId } = createTestApp();
    app.post('/v0/test', (c) => {
      return c.json({ actorId: c.get('actorId') });
    });

    const res = await app.request('/v0/test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ actor_id: testPrincipalId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actorId).toBe(testPrincipalId);
  });

  it('resolves actor by actor_handle on POST', async () => {
    const { app, testAgentToken, testPrincipalId, testPrincipalHandle } = createTestApp();
    app.post('/v0/test', (c) => {
      return c.json({ actorId: c.get('actorId') });
    });

    const res = await app.request('/v0/test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ actor_handle: testPrincipalHandle }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actorId).toBe(testPrincipalId);
  });

  it('returns 404 for non-existent actor_id', async () => {
    const { app, testAgentToken } = createTestApp();
    app.post('/v0/test', (c) => c.json({ ok: true }));

    const res = await app.request('/v0/test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ actor_id: 'non-existent-id' }),
    });
    expect(res.status).toBe(404);
  });

  it('does not require actor on GET requests', async () => {
    const { app, testAgentToken } = createTestApp();
    app.get('/v0/test', (c) => {
      return c.json({ workspaceId: c.get('workspaceId') });
    });

    const res = await app.request('/v0/test', {
      headers: { Authorization: `Bearer ${testAgentToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspaceId).toBeTruthy();
  });

  it('sets workspaceId on context for all requests', async () => {
    const { app, testAgentToken, workspaceId } = createTestApp();
    app.get('/v0/test', (c) => {
      return c.json({ workspaceId: c.get('workspaceId') });
    });

    const res = await app.request('/v0/test', {
      headers: { Authorization: `Bearer ${testAgentToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspaceId).toBe(workspaceId);
  });

  it('makes services available on context', async () => {
    const { app, testAgentToken } = createTestApp();
    app.get('/v0/test', (c) => {
      const ps = c.get('principalService');
      const pj = c.get('projectService');
      const ts = c.get('taskService');
      const ms = c.get('maintenanceService');
      return c.json({
        hasPrincipalService: !!ps,
        hasProjectService: !!pj,
        hasTaskService: !!ts,
        hasMaintenanceService: !!ms,
      });
    });

    const res = await app.request('/v0/test', {
      headers: { Authorization: `Bearer ${testAgentToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasPrincipalService).toBe(true);
    expect(body.hasProjectService).toBe(true);
    expect(body.hasTaskService).toBe(true);
    expect(body.hasMaintenanceService).toBe(true);
  });
});
