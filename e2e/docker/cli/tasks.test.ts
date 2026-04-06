import { describe, expect, it } from 'vitest';
import { runCli, runCliJson } from '../setup/cli-runner.js';
import { client } from '../setup/test-client.js';

describe('CLI: task operations', () => {
  const actor = 'e2e-agent';
  let projectId: string;

  it('setup: create project via API', async () => {
    projectId = (await client.post('/v0/projects', {
      key: 'CCLI', name: 'CLI Test Project', actor_handle: actor,
    })).data.id;
  });

  it('creates a task', async () => {
    const { result, exitCode } = await runCliJson([
      'task', 'create', '--title', 'CLI task', '--type', 'feature', '--project', projectId,
    ]);
    expect(exitCode).toBe(0);
    expect(result.title).toBe('CLI task');
    expect(result.status).toBe('open');
    expect(result.key).toBe('CCLI-1');
  });

  it('lists tasks', async () => {
    const { stdout, exitCode } = await runCli(['task', 'list']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('CLI task');
  });

  it('shows a task by key', async () => {
    const { stdout, exitCode } = await runCli(['task', 'show', 'CCLI-1']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('CCLI-1');
  });

  it('claims a task', async () => {
    const { result, exitCode } = await runCliJson(['task', 'claim', 'CCLI-1']);
    expect(exitCode).toBe(0);
    expect(result.status).toBe('claimed');
  });

  it('starts a task', async () => {
    const { result, exitCode } = await runCliJson(['task', 'start', 'CCLI-1']);
    expect(exitCode).toBe(0);
    expect(result.status).toBe('in_progress');
  });

  it('closes a task', async () => {
    const { result, exitCode } = await runCliJson(['task', 'close', 'CCLI-1']);
    expect(exitCode).toBe(0);
    // CLI close command transitions to 'completed' status
    expect(['closed', 'completed']).toContain(result.status);
  });
});
