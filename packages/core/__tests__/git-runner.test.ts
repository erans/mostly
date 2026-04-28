import { describe, expect, it } from 'vitest';
import { FakeGitRunner } from '../src/git-runner.js';

describe('FakeGitRunner', () => {
  it('returns scripted output for matching argv', async () => {
    const runner = new FakeGitRunner({
      'rev-parse --show-toplevel': '/tmp/repo\n',
      'config user.email': 'eran@example.com\n',
    });
    expect(await runner.run('/tmp/repo', ['rev-parse', '--show-toplevel'])).toBe('/tmp/repo\n');
    expect(await runner.run('/tmp/repo', ['config', 'user.email'])).toBe('eran@example.com\n');
  });

  it('throws on unscripted invocation', async () => {
    const runner = new FakeGitRunner({});
    await expect(runner.run('/tmp/repo', ['status'])).rejects.toThrow();
  });

  it('honors null script entry as failure', async () => {
    const runner = new FakeGitRunner({ 'config user.email': null });
    await expect(runner.run('/tmp/repo', ['config', 'user.email'])).rejects.toThrow();
  });
});
