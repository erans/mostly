import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Actor resolution', () => {
  const actor = 'e2e-agent';

  it('resolves actor by handle', async () => {
    const res = await client.post('/v0/projects', {
      key: 'ACTR', name: 'Actor Test', actor_handle: actor,
    });
    expect(res.status).toBe(200);
  });

  it('rejects POST without actor', async () => {
    const res = await client.post('/v0/projects', {
      key: 'NOACTR', name: 'No Actor',
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown actor handle', async () => {
    const res = await client.post('/v0/projects', {
      key: 'BADACTR', name: 'Bad Actor', actor_handle: 'nonexistent-agent',
    });
    expect(res.status).toBe(404);
  });
});
