import { describe, expect, it } from 'vitest';
import { FakeGitRunner } from '../src/git-runner.js';
import { gatherGitContext } from '../src/git-context.js';

describe('gatherGitContext', () => {
  it('returns null when not in a git repo', async () => {
    const runner = new FakeGitRunner({ 'rev-parse --show-toplevel': null });
    expect(await gatherGitContext('/tmp/not-a-repo', runner)).toBeNull();
  });

  it('gathers remotes, branch, email, relPath at root', async () => {
    const runner = new FakeGitRunner({
      'rev-parse --show-toplevel': '/repo\n',
      'remote -v': 'origin\tgit@github.com:acme/auth.git (fetch)\norigin\tgit@github.com:acme/auth.git (push)\nupstream\thttps://github.com/upstream/auth.git (fetch)\nupstream\thttps://github.com/upstream/auth.git (push)\n',
      'rev-parse --abbrev-ref HEAD': 'AUTH-1-foo\n',
      'config user.email': 'eran@example.com\n',
    });
    const ctx = await gatherGitContext('/repo', runner);
    expect(ctx).not.toBeNull();
    expect(ctx!.repoRoot).toBe('/repo');
    expect(ctx!.remotes.map(r => r.name)).toEqual(['origin', 'upstream']);
    expect(ctx!.remotes[0].normalized_url).toBe('github.com/acme/auth');
    expect(ctx!.remotes[1].normalized_url).toBe('github.com/upstream/auth');
    expect(ctx!.branch).toBe('AUTH-1-foo');
    expect(ctx!.authorEmail).toBe('eran@example.com');
    expect(ctx!.relPath).toBe('');
  });

  it('reports relPath when cwd is a subdir of repo root', async () => {
    const runner = new FakeGitRunner({
      'rev-parse --show-toplevel': '/repo\n',
      'remote -v': '',
      'rev-parse --abbrev-ref HEAD': 'main\n',
      'config user.email': 'eran@example.com\n',
    });
    const ctx = await gatherGitContext('/repo/packages/auth', runner);
    expect(ctx!.relPath).toBe('packages/auth');
  });

  it('handles detached HEAD (branch is null)', async () => {
    const runner = new FakeGitRunner({
      'rev-parse --show-toplevel': '/repo\n',
      'remote -v': '',
      'rev-parse --abbrev-ref HEAD': 'HEAD\n',
      'config user.email': null,
    });
    const ctx = await gatherGitContext('/repo', runner);
    expect(ctx!.branch).toBeNull();
    expect(ctx!.authorEmail).toBeNull();
  });

  it('skips remotes whose URLs do not normalize cleanly', async () => {
    const runner = new FakeGitRunner({
      'rev-parse --show-toplevel': '/repo\n',
      'remote -v': 'broken\tnot-a-url (fetch)\nbroken\tnot-a-url (push)\n',
      'rev-parse --abbrev-ref HEAD': 'main\n',
      'config user.email': null,
    });
    const ctx = await gatherGitContext('/repo', runner);
    expect(ctx!.remotes).toEqual([]);
  });
});
