import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Projects CRUD', () => {
  const actor = 'e2e-agent';
  let projectId: string;

  it('creates a project', async () => {
    const res = await client.post('/v0/projects', {
      key: 'E2E',
      name: 'E2E Test Project',
      actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.key).toBe('E2E');
    expect(res.data.name).toBe('E2E Test Project');
    expect(res.data.id).toMatch(/^proj_/);
    projectId = res.data.id;
  });

  it('lists projects', async () => {
    const res = await client.get('/v0/projects');
    expect(res.status).toBe(200);
    expect(res.data.items.length).toBeGreaterThanOrEqual(1);
    expect(res.data.items.some((p: any) => p.key === 'E2E')).toBe(true);
  });

  it('rejects duplicate project key', async () => {
    const res = await client.post('/v0/projects', {
      key: 'E2E',
      name: 'Duplicate',
      actor_handle: actor,
    });
    expect(res.status).toBe(400);
  });
});
