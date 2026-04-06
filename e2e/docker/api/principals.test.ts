import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Principals CRUD', () => {
  const actorId = 'e2e-agent';
  let createdPrincipalId: string;

  it('creates a principal', async () => {
    const res = await client.post('/v0/principals', {
      handle: 'test-human-1',
      kind: 'human',
      display_name: 'Test Human',
      actor_handle: actorId,
    });
    expect(res.status).toBe(200);
    expect(res.data.handle).toBe('test-human-1');
    expect(res.data.kind).toBe('human');
    expect(res.data.display_name).toBe('Test Human');
    expect(res.data.is_active).toBe(true);
    expect(res.data.id).toMatch(/^prin_/);
    createdPrincipalId = res.data.id;
  });

  it('lists principals', async () => {
    const res = await client.get('/v0/principals');
    expect(res.status).toBe(200);
    expect(res.data.items.length).toBeGreaterThanOrEqual(2);
    const handles = res.data.items.map((p: any) => p.handle);
    expect(handles).toContain('e2e-agent');
    expect(handles).toContain('test-human-1');
  });

  it('gets principal by ID', async () => {
    const res = await client.get(`/v0/principals/${createdPrincipalId}`);
    expect(res.status).toBe(200);
    expect(res.data.id).toBe(createdPrincipalId);
    expect(res.data.handle).toBe('test-human-1');
  });

  it('gets principal by handle', async () => {
    const res = await client.get('/v0/principals/test-human-1');
    expect(res.status).toBe(200);
    expect(res.data.handle).toBe('test-human-1');
  });

  it('rejects duplicate handle', async () => {
    const res = await client.post('/v0/principals', {
      handle: 'test-human-1',
      kind: 'human',
      display_name: 'Duplicate',
      actor_handle: actorId,
    });
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown principal', async () => {
    const res = await client.get('/v0/principals/nonexistent');
    expect(res.status).toBe(404);
  });
});
