import { describe, expect, it } from 'vitest';
import { runCli, runCliJson } from '../setup/cli-runner.js';

describe('CLI: principal operations', () => {
  it('creates a principal', async () => {
    const { result, exitCode } = await runCliJson([
      'principal', 'create', '--handle', 'cli-test-agent', '--kind', 'agent', '--display-name', 'CLI Test Agent',
    ]);
    expect(exitCode).toBe(0);
    expect(result.handle).toBe('cli-test-agent');
  });

  it('lists principals', async () => {
    const { stdout, exitCode } = await runCli(['principal', 'list']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('e2e-agent');
  });
});
