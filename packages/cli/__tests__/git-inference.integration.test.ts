/**
 * Integration test: git-aware inference pipeline
 *
 * Architecture note
 * -----------------
 * The Hono app exposed by createTestApp() supports `app.request(url, init)` —
 * the same signature as the WHATWG `fetch` API. We exploit this by patching
 * `globalThis.fetch` for the duration of each test so that MostlyClient's
 * internal `fetch` calls are transparently routed through the in-process Hono
 * app, with no real TCP socket required.
 *
 * What is fully integrated (real):
 *   - Real git operations (execFileSync on the actual git binary)
 *   - Real gatherGitContext / normalizeGitUrl / inferTaskFromBranch logic
 *   - Real resolveGitContext (the helper under test)
 *   - Real MostlyClient (auth, actor injection, error parsing)
 *   - Real server routes: /v0/git-context/resolve, /v0/principals, /v0/projects,
 *     /v0/projects/:id/repo-links
 *   - Real RepoLinkService resolution logic (SQL via in-memory SQLite)
 *
 * What is stubbed / not exercised:
 *   - No real TCP listener — network layer is bypassed via fetch patch
 *   - No CLI Commander `parseAsync` invocation for the link command; we call
 *     the underlying APIs directly to keep the test self-contained and avoid
 *     Commander's process.exit() calls in error paths.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp } from '../../server/__tests__/helpers.js';
import { MostlyClient } from '../src/client.js';
import { resolveGitContext } from '../src/git-inference.js';

// ---------------------------------------------------------------------------
// Guard: skip the entire suite if `git` is not on PATH
// ---------------------------------------------------------------------------
const GIT_AVAILABLE = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
})();

// ---------------------------------------------------------------------------
// In-process fetch adapter
// ---------------------------------------------------------------------------
// The Hono app supports `app.request(url | Request, RequestInit?)` which is
// equivalent to `fetch(url, init)`. We swap globalThis.fetch before each test
// so MostlyClient routes through the in-process app.
//
// We strip the http://localhost prefix from the URL so Hono receives just the
// path (e.g. `/v0/git-context/resolve`), which is what all server tests do.
function makeInProcessFetch(app: ReturnType<typeof createTestApp>['app']) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    // Strip scheme+host so Hono sees a bare path
    const stripped = url.replace(/^https?:\/\/[^/]+/, '');
    return app.request(stripped, init as RequestInit);
  };
}

// ---------------------------------------------------------------------------
// withTempGitRepo helper
// ---------------------------------------------------------------------------
interface TempRepoOpts {
  remote?: string;
  remotes?: Array<{ name: string; url: string }>;
  branch?: string;
  email?: string;
  name?: string;
}

function withTempGitRepo(opts: TempRepoOpts): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'mostly-it-'));
  const sh = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  sh('init', '-q');
  sh('config', 'commit.gpgsign', 'false');
  sh('config', 'user.name', opts.name ?? 'test');
  // user.email is required for commits even if not used in the test scenario
  sh('config', 'user.email', opts.email ?? 'test@example.com');
  if (opts.remote) sh('remote', 'add', 'origin', opts.remote);
  if (opts.remotes) {
    for (const r of opts.remotes) sh('remote', 'add', r.name, r.url);
  }
  // Create an initial commit so that `git rev-parse --abbrev-ref HEAD` works.
  // Without at least one commit HEAD is unresolvable in a fresh repo.
  writeFileSync(path.join(dir, '.gitkeep'), '');
  sh('add', '.gitkeep');
  sh('commit', '-q', '-m', 'init');
  if (opts.branch) sh('checkout', '-q', '-B', opts.branch);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe.skipIf(!GIT_AVAILABLE)('git-inference integration', () => {
  let env: ReturnType<typeof createTestApp>;
  let client: MostlyClient;
  const BASE_URL = 'http://localhost';

  // Saved original fetch so we can restore between tests
  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    env = createTestApp();
  });

  beforeEach(() => {
    // Patch fetch to route through in-process Hono app
    globalThis.fetch = makeInProcessFetch(env.app) as typeof fetch;

    client = new MostlyClient({
      serverUrl: BASE_URL,
      agentToken: env.testAgentToken,
      actor: env.testPrincipalHandle,
    });
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  // ---------------------------------------------------------------------------
  // Helpers that talk to the in-process server via HTTP
  // ---------------------------------------------------------------------------
  async function createProject(key: string, name: string) {
    const res = await client.post('/v0/projects', { key, name });
    return res.data as { id: string; key: string };
  }

  async function createLink(projectId: string, normalizedUrl: string, subpath = '') {
    const res = await client.post(`/v0/projects/${projectId}/repo-links`, {
      normalized_url: normalizedUrl,
      subpath,
    });
    return res.data as { id: string; normalized_url: string; subpath: string };
  }

  async function createPrincipalWithEmail(handle: string, email: string) {
    const res = await client.post('/v0/principals', {
      handle,
      kind: 'human',
      display_name: handle,
      email,
    });
    return res.data as { id: string; handle: string };
  }

  // ---------------------------------------------------------------------------
  // Scenario 1: link → resolve round-trip
  // ---------------------------------------------------------------------------
  it('link → resolve round-trip: resolves project from remote URL', async () => {
    const { dir, cleanup } = withTempGitRepo({
      remote: 'git@github.com:acme/auth-it.git',
      branch: 'main',
    });
    try {
      const project = await createProject('AUTHIT', 'Auth IT');
      await createLink(project.id, 'github.com/acme/auth-it');

      const result = await resolveGitContext({ cwd: dir, client, disabled: false });
      expect(result.projectKey).toBe('AUTHIT');
      expect(result.source.project).toBe('git:resolve');
    } finally {
      cleanup();
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: branch → task key inference
  // ---------------------------------------------------------------------------
  it('branch → task inference: extracts task key from branch name', async () => {
    const { dir, cleanup } = withTempGitRepo({
      remote: 'git@github.com:acme/auth-branch.git',
      branch: 'AUTH2-1-add-login',
    });
    try {
      const project = await createProject('AUTH2', 'Auth Branch Test');
      await createLink(project.id, 'github.com/acme/auth-branch');

      const result = await resolveGitContext({ cwd: dir, client, disabled: false });
      expect(result.projectKey).toBe('AUTH2');
      expect(result.taskKey).toBe('AUTH2-1');
      expect(result.source.task).toBe('git:branch');
    } finally {
      cleanup();
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: email → actor inference
  // ---------------------------------------------------------------------------
  it('email → actor inference: resolves actor from git user.email', async () => {
    const { dir, cleanup } = withTempGitRepo({
      remote: 'git@github.com:acme/auth-actor.git',
      branch: 'main',
      email: 'jane@acme.example.com',
    });
    try {
      const project = await createProject('AUTH3', 'Auth Actor Test');
      await createLink(project.id, 'github.com/acme/auth-actor');
      await createPrincipalWithEmail('jane', 'jane@acme.example.com');

      const result = await resolveGitContext({ cwd: dir, client, disabled: false });
      expect(result.actorHandle).toBe('jane');
      expect(result.source.actor).toBe('git:email');
    } finally {
      cleanup();
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: monorepo subpath — deeper cwd picks more specific link
  // ---------------------------------------------------------------------------
  it('monorepo subpath: picks the more specific link when cwd is inside a sub-package', async () => {
    // Repo root is linked to proj_root; packages/auth subpath is linked to proj_auth.
    // When cwd is <repoRoot>/packages/auth/src, resolver should pick proj_auth.
    const { dir, cleanup } = withTempGitRepo({
      remote: 'git@github.com:acme/monorepo-it.git',
      branch: 'main',
    });
    try {
      const projRoot = await createProject('MONORT', 'Monorepo Root');
      const projAuth = await createProject('MONOAUTH', 'Monorepo Auth');
      await createLink(projRoot.id, 'github.com/acme/monorepo-it', '');
      await createLink(projAuth.id, 'github.com/acme/monorepo-it', 'packages/auth');

      // Create the subpath directory so gatherGitContext can compute relPath
      mkdirSync(path.join(dir, 'packages', 'auth', 'src'), { recursive: true });

      const cwd = path.join(dir, 'packages', 'auth', 'src');
      const result = await resolveGitContext({ cwd, client, disabled: false });
      expect(result.projectKey).toBe('MONOAUTH');
      expect(result.source.project).toBe('git:resolve');
    } finally {
      cleanup();
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: ambiguous remotes → resolveGitContext rejects (400 propagates)
  // ---------------------------------------------------------------------------
  it('ambiguous remotes: rejects when two remotes point to two different linked projects', async () => {
    // Two remotes, each linked to a different project at the same subpath
    const { dir, cleanup } = withTempGitRepo({
      remotes: [
        { name: 'origin', url: 'git@github.com:acme/ambig-a.git' },
        { name: 'upstream', url: 'git@github.com:acme/ambig-b.git' },
      ],
      branch: 'main',
    });
    try {
      const projA = await createProject('AMBIGA', 'Ambiguous A');
      const projB = await createProject('AMBIGB', 'Ambiguous B');
      await createLink(projA.id, 'github.com/acme/ambig-a');
      await createLink(projB.id, 'github.com/acme/ambig-b');

      let err: any;
      try {
        await resolveGitContext({ cwd: dir, client, disabled: false });
      } catch (e) { err = e; }
      expect(err).toBeDefined();
      expect(err.status).toBe(400);
      expect(String(err.message ?? '').toLowerCase()).toContain('ambiguous');
    } finally {
      cleanup();
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: --no-git-context flag → returns empty inference
  // ---------------------------------------------------------------------------
  it('--no-git-context: returns empty inference even in a fully-set-up repo', async () => {
    const { dir, cleanup } = withTempGitRepo({
      remote: 'git@github.com:acme/auth-nogit.git',
      branch: 'AUTH6-1-do-something',
      email: 'dev@example.com',
    });
    try {
      const project = await createProject('AUTH6', 'Auth No Git');
      await createLink(project.id, 'github.com/acme/auth-nogit');

      const result = await resolveGitContext({ cwd: dir, client, disabled: true });
      expect(result.projectKey).toBeUndefined();
      expect(result.taskKey).toBeUndefined();
      expect(result.actorHandle).toBeUndefined();
      expect(result.source.project).toBe('none');
      expect(result.source.task).toBe('none');
      expect(result.source.actor).toBe('none');
    } finally {
      cleanup();
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario 7: server-down / 5xx → soft failure with note, no crash
  // ---------------------------------------------------------------------------
  it('server-down / 5xx: soft failure — no crash, result has notes', async () => {
    const { dir, cleanup } = withTempGitRepo({
      remote: 'git@github.com:acme/auth-down.git',
      branch: 'main',
    });
    try {
      // Override fetch to simulate a 5xx response for the resolve endpoint
      const prevFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
        if (url.includes('/v0/git-context/resolve')) {
          return new Response(JSON.stringify({ error: { message: 'internal error' } }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          });
        }
        return prevFetch(input as any, init);
      }) as typeof fetch;

      try {
        const result = await resolveGitContext({ cwd: dir, client, disabled: false });
        // Should not throw; should have a note
        expect(result.projectKey).toBeUndefined();
        expect(result.notes.length).toBeGreaterThan(0);
        expect(result.notes.some((n) => n.includes('resolve failed') || n.includes('git-context'))).toBe(true);
      } finally {
        globalThis.fetch = prevFetch;
      }
    } finally {
      cleanup();
    }
  });
});
