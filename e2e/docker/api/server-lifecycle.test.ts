import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Server lifecycle', () => {
  it('has a healthy server', async () => {
    const healthy = await client.healthz();
    expect(healthy).toBe(true);
  });

  it('ran migrations (workspace table exists)', async () => {
    const res = await client.get('/v0/principals');
    expect(res.status).toBe(200);
    expect(res.data).toBeDefined();
  });

  it('seeded bootstrap principal', async () => {
    const res = await client.get('/v0/principals/e2e-agent');
    expect(res.status).toBe(200);
    expect(res.data.handle).toBe('e2e-agent');
    expect(res.data.kind).toBe('agent');
    expect(res.data.is_active).toBe(true);
  });
});
