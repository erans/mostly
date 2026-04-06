import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Maintenance', () => {
  const actor = 'e2e-agent';
  let projectId: string;

  it('setup: create project', async () => {
    projectId = (await client.post('/v0/projects', {
      key: 'MAINT', name: 'Maintenance Tests', actor_handle: actor,
    })).data.id;
  });

  it('reaps expired claims', async () => {
    const task = (await client.post('/v0/tasks', {
      title: 'Expiring claim', type: 'chore', project_id: projectId, actor_handle: actor,
    })).data;

    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, claim_expires_at: pastExpiry, actor_handle: actor,
    });

    const reapRes = await client.post('/v0/maintenance/reap-expired-claims', {
      actor_handle: actor,
    });
    expect(reapRes.status).toBe(200);

    const taskRes = await client.get(`/v0/tasks/${task.id}`);
    expect(taskRes.data.status).toBe('open');
    expect(taskRes.data.claimed_by_id).toBeNull();
  });

  it('does not reap non-expired claims', async () => {
    const task = (await client.post('/v0/tasks', {
      title: 'Active claim', type: 'feature', project_id: projectId, actor_handle: actor,
    })).data;

    const futureExpiry = new Date(Date.now() + 3600000).toISOString();
    await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, claim_expires_at: futureExpiry, actor_handle: actor,
    });

    await client.post('/v0/maintenance/reap-expired-claims', { actor_handle: actor });

    const taskRes = await client.get(`/v0/tasks/${task.id}`);
    expect(taskRes.data.status).toBe('claimed');
    expect(taskRes.data.claimed_by_id).toBeTruthy();
  });
});
