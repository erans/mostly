import { describe, expect, it } from 'vitest';
import { client, clientWithToken, SERVER_URL } from '../setup/test-client.js';

describe('Authentication', () => {
  it('allows requests with valid token', async () => {
    const res = await client.get('/v0/principals');
    expect(res.status).toBe(200);
  });

  it('rejects requests with no Authorization header', async () => {
    const res = await fetch(`${SERVER_URL}/v0/principals`);
    expect(res.status).toBe(401);
  });

  it('rejects requests with invalid token', async () => {
    const badClient = clientWithToken('wrong-token');
    const res = await badClient.get('/v0/principals');
    expect(res.status).toBe(401);
  });

  it('rejects requests with empty Bearer token', async () => {
    const emptyClient = clientWithToken('');
    const res = await emptyClient.get('/v0/principals');
    expect(res.status).toBe(401);
  });

  it('allows /healthz without auth', async () => {
    const res = await fetch(`${SERVER_URL}/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
