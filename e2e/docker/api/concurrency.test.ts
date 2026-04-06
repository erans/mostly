import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Concurrency', () => {
  const actor = 'e2e-agent';
  let projectId: string;

  it('setup: create project', async () => {
    projectId = (await client.post('/v0/projects', {
      key: 'CONC', name: 'Concurrency Tests', actor_handle: actor,
    })).data.id;
  });

  it('optimistic locking: one succeeds, one gets 409', async () => {
    const task = (await client.post('/v0/tasks', {
      title: 'Locking test', type: 'feature', project_id: projectId, actor_handle: actor,
    })).data;

    const [res1, res2] = await Promise.all([
      client.post(`/v0/tasks/${task.id}/claim`, {
        expected_version: task.version, actor_handle: actor,
      }),
      client.post(`/v0/tasks/${task.id}/claim`, {
        expected_version: task.version, actor_handle: actor,
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('stale version is rejected', async () => {
    const task = (await client.post('/v0/tasks', {
      title: 'Stale version', type: 'bug', project_id: projectId, actor_handle: actor,
    })).data;

    await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    });

    const res = await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    });
    expect(res.status).toBe(409);
  });
});
