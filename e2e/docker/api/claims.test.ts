import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Task claims', () => {
  const actor = 'e2e-agent';
  let projectId: string;

  async function createTask(title: string) {
    return (await client.post('/v0/tasks', {
      title, type: 'feature', project_id: projectId, actor_handle: actor,
    })).data;
  }

  it('setup: create project', async () => {
    projectId = (await client.post('/v0/projects', {
      key: 'CLM', name: 'Claim Tests', actor_handle: actor,
    })).data.id;
  });

  it('acquires a claim', async () => {
    const task = await createTask('claim-acquire');
    const res = await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('claimed');
    expect(res.data.claimed_by_id).toBeTruthy();
  });

  it('acquires a claim with TTL', async () => {
    const task = await createTask('claim-ttl');
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    const res = await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, claim_expires_at: expiresAt, actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.claim_expires_at).toBeTruthy();
  });

  it('renews a claim', async () => {
    const task = await createTask('claim-renew');
    const claimed = (await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    })).data;
    const newExpiry = new Date(Date.now() + 7200000).toISOString();
    const res = await client.post(`/v0/tasks/${task.id}/renew-claim`, {
      expected_version: claimed.version, claim_expires_at: newExpiry, actor_handle: actor,
    });
    expect(res.status).toBe(200);
  });

  it('releases a claim', async () => {
    const task = await createTask('claim-release');
    const claimed = (await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    })).data;
    const res = await client.post(`/v0/tasks/${task.id}/release-claim`, {
      expected_version: claimed.version, actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('open');
    expect(res.data.claimed_by_id).toBeNull();
  });

  it('rejects double claim (version conflict)', async () => {
    await client.post('/v0/principals', {
      handle: 'claim-agent-2', kind: 'agent', display_name: 'Claim Agent 2', actor_handle: actor,
    });
    const task = await createTask('double-claim');
    await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    });
    const res = await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: 'claim-agent-2',
    });
    expect(res.status).toBe(409);
  });
});
