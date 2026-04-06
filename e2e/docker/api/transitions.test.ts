import { describe, expect, it } from 'vitest';
import { client } from '../setup/test-client.js';

describe('Task transitions', () => {
  const actor = 'e2e-agent';
  let projectId: string;

  async function createTask(title: string) {
    const res = await client.post('/v0/tasks', {
      title, type: 'feature', project_id: projectId, actor_handle: actor,
    });
    return res.data;
  }

  it('setup: create project', async () => {
    const res = await client.post('/v0/projects', {
      key: 'TRAN', name: 'Transition Tests', actor_handle: actor,
    });
    projectId = res.data.id;
  });

  it('open -> claimed (via claim endpoint)', async () => {
    const task = await createTask('claim-test');
    const res = await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('claimed');
    expect(res.data.claimed_by_id).toBeTruthy();
  });

  it('claimed -> in_progress', async () => {
    const task = await createTask('start-test');
    const claimed = (await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    })).data;
    const res = await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'in_progress', expected_version: claimed.version, actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('in_progress');
  });

  it('in_progress -> blocked', async () => {
    const task = await createTask('block-test');
    const claimed = (await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    })).data;
    const started = (await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'in_progress', expected_version: claimed.version, actor_handle: actor,
    })).data;
    const res = await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'blocked', expected_version: started.version, actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('blocked');
  });

  it('in_progress -> closed with resolution', async () => {
    const task = await createTask('close-test');
    const claimed = (await client.post(`/v0/tasks/${task.id}/claim`, {
      expected_version: task.version, actor_handle: actor,
    })).data;
    const started = (await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'in_progress', expected_version: claimed.version, actor_handle: actor,
    })).data;
    const res = await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'closed', resolution: 'completed', expected_version: started.version, actor_handle: actor,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('closed');
    expect(res.data.resolution).toBe('completed');
    expect(res.data.resolved_at).toBeTruthy();
  });

  it('rejects invalid transition (open -> in_progress)', async () => {
    const task = await createTask('invalid-transition');
    const res = await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'in_progress', expected_version: task.version, actor_handle: actor,
    });
    expect(res.status).toBe(412);
  });

  it('rejects invalid transition (open -> blocked)', async () => {
    const task = await createTask('invalid-close');
    const res = await client.post(`/v0/tasks/${task.id}/transition`, {
      to_status: 'blocked', expected_version: task.version, actor_handle: actor,
    });
    expect(res.status).toBe(412);
  });
});
