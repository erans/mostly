import { describe, expect, it } from 'vitest';
import { runCli, runCliJson } from '../setup/cli-runner.js';

describe('CLI: project operations', () => {
  it('creates a project', async () => {
    const { result, exitCode } = await runCliJson([
      'project', 'create', '--key', 'CLIP', '--name', 'CLI Project Test',
    ]);
    expect(exitCode).toBe(0);
    expect(result.key).toBe('CLIP');
  });

  it('lists projects', async () => {
    const { result, exitCode } = await runCliJson(['project', 'list']);
    expect(exitCode).toBe(0);
    const keys = result.items.map((p: any) => p.key);
    expect(keys).toContain('CLIP');
  });
});
