import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

describe('GET /healthz', () => {
  it('returns 200 with { status: ok } without auth', async () => {
    const { app } = createTestApp();

    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('returns 200 even with invalid auth header', async () => {
    const { app } = createTestApp();

    const res = await app.request('/healthz', {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
