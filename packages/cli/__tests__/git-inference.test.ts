import { describe, expect, it, vi } from 'vitest';
import { resolveGitContext } from '../src/git-inference.js';
import { FakeGitRunner } from '@mostly/core';

describe('resolveGitContext', () => {
  it('returns empty inference when --no-git-context (disabled)', async () => {
    const r = await resolveGitContext({ cwd: '/repo', client: {} as any, disabled: true, runner: new FakeGitRunner({}) });
    expect(r.projectKey).toBeUndefined();
    expect(r.taskKey).toBeUndefined();
    expect(r.actorHandle).toBeUndefined();
    expect(r.source.project).toBe('none');
  });

  it('returns empty inference when not in a git repo', async () => {
    const runner = new FakeGitRunner({ 'rev-parse --show-toplevel': null });
    const client = { post: vi.fn(), get: vi.fn() };
    const r = await resolveGitContext({ cwd: '/tmp', client: client as any, disabled: false, runner });
    expect(r.projectKey).toBeUndefined();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('infers project + task + actor from a fully-populated repo', async () => {
    const runner = new FakeGitRunner({
      'rev-parse --show-toplevel': '/repo\n',
      'remote -v': 'origin\tgit@github.com:acme/auth.git (fetch)\norigin\tgit@github.com:acme/auth.git (push)\n',
      'rev-parse --abbrev-ref HEAD': 'AUTH-1-add-login\n',
      'config user.email': 'eran@example.com\n',
    });
    const client = {
      post: vi.fn(async (path: string) => {
        if (path === '/v0/git-context/resolve') {
          return { data: { project_id: 'proj_1', project_key: 'AUTH', link_id: 'rlnk_1', matched_url: 'github.com/acme/auth', matched_subpath: '' } };
        }
        throw new Error('unexpected post ' + path);
      }),
      get: vi.fn(async (path: string) => {
        if (path.startsWith('/v0/principals?email=')) {
          return { data: [{ id: 'prin_1', handle: 'eran', email: 'eran@example.com', is_active: true }] };
        }
        return { data: [] };
      }),
    };
    const r = await resolveGitContext({ cwd: '/repo', client: client as any, disabled: false, runner });
    expect(r.projectKey).toBe('AUTH');
    expect(r.taskKey).toBe('AUTH-1');
    expect(r.actorHandle).toBe('eran');
    expect(r.source.project).toBe('git:resolve');
    expect(r.source.task).toBe('git:branch');
    expect(r.source.actor).toBe('git:email');
  });

  it('does not return taskKey when branch matches a different project key', async () => {
    const runner = new FakeGitRunner({
      'rev-parse --show-toplevel': '/repo\n',
      'remote -v': 'origin\tgit@github.com:acme/auth.git (fetch)\norigin\tgit@github.com:acme/auth.git (push)\n',
      'rev-parse --abbrev-ref HEAD': 'BILLING-2-foo\n',
      'config user.email': null,
    });
    const client = {
      post: vi.fn(async () => ({ data: { project_id: 'proj_1', project_key: 'AUTH', link_id: 'rlnk_1', matched_url: 'github.com/acme/auth', matched_subpath: '' } })),
      get: vi.fn(),
    };
    const r = await resolveGitContext({ cwd: '/repo', client: client as any, disabled: false, runner });
    expect(r.projectKey).toBe('AUTH');
    expect(r.taskKey).toBeUndefined();
  });

  it('does not return actor when email matches multiple principals', async () => {
    const runner = new FakeGitRunner({
      'rev-parse --show-toplevel': '/repo\n',
      'remote -v': '',
      'rev-parse --abbrev-ref HEAD': 'main\n',
      'config user.email': 'shared@example.com\n',
    });
    const client = {
      post: vi.fn(async () => ({ data: null })),
      get: vi.fn(async () => ({ data: [{ id: 'a', handle: 'alice', is_active: true }, { id: 'b', handle: 'bob', is_active: true }] })),
    };
    const r = await resolveGitContext({ cwd: '/repo', client: client as any, disabled: false, runner });
    expect(r.actorHandle).toBeUndefined();
    expect(r.source.actor).toBe('ambiguous');
    expect(r.notes.some(n => n.includes('2 principals'))).toBe(true);
  });

  it('propagates 400 from the resolve endpoint (ambiguous remotes)', async () => {
    const runner = new FakeGitRunner({
      'rev-parse --show-toplevel': '/repo\n',
      'remote -v': 'origin\tgit@github.com:acme/auth.git (fetch)\norigin\tgit@github.com:acme/auth.git (push)\n',
      'rev-parse --abbrev-ref HEAD': 'main\n',
      'config user.email': null,
    });
    const client = {
      post: vi.fn(async () => { const e: any = new Error('ambiguous: ...'); e.status = 400; throw e; }),
      get: vi.fn(),
    };
    await expect(
      resolveGitContext({ cwd: '/repo', client: client as any, disabled: false, runner }),
    ).rejects.toThrow();
  });

  it('skips inactive principals when picking the actor', async () => {
    const runner = new FakeGitRunner({
      'rev-parse --show-toplevel': '/repo\n',
      'remote -v': '',
      'rev-parse --abbrev-ref HEAD': 'main\n',
      'config user.email': 'eran@example.com\n',
    });
    const client = {
      post: vi.fn(async () => ({ data: null })),
      get: vi.fn(async () => ({ data: [
        { id: 'p1', handle: 'eran-old', is_active: false },
        { id: 'p2', handle: 'eran', is_active: true },
      ] })),
    };
    const r = await resolveGitContext({ cwd: '/repo', client: client as any, disabled: false, runner });
    expect(r.actorHandle).toBe('eran');
  });

  it('falls back to default when only matches are inactive', async () => {
    const runner = new FakeGitRunner({
      'rev-parse --show-toplevel': '/repo\n',
      'remote -v': '',
      'rev-parse --abbrev-ref HEAD': 'main\n',
      'config user.email': 'eran@example.com\n',
    });
    const client = {
      post: vi.fn(async () => ({ data: null })),
      get: vi.fn(async () => ({ data: [
        { id: 'p1', handle: 'eran-old', is_active: false },
      ] })),
    };
    const r = await resolveGitContext({ cwd: '/repo', client: client as any, disabled: false, runner });
    expect(r.actorHandle).toBeUndefined();
    expect(r.source.actor).toBe('none');
  });
});
