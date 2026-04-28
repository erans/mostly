/**
 * E2E scenario: git-aware project inference golden path
 *
 * Mirrors the structure of e2e/smoke.test.ts (in-process Hono app, in-memory
 * SQLite, real agent-token auth) and exercises the full pipeline:
 *
 *   1. Create project DEMO via HTTP API.
 *   2. Seed a principal whose email matches git config user.email.
 *   3. Stand up a temp git repo with origin pointed at a fixture URL, on
 *      branch DEMO-1-x.
 *   4. POST /v0/projects/DEMO/repo-links with the normalised origin URL.
 *   5. resolveGitContext against the temp repo → assert project/task/actor.
 *   6. POST /v0/tasks with project_id inferred from git → assert task is DEMO.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  createInMemoryDb,
  runMigrations,
  createRepositories,
  createTransactionManager,
} from '@mostly/db';
import {
  PrincipalService,
  ProjectService,
  TaskService,
  MaintenanceService,
  AuthService,
  RepoLinkService,
  sha256,
  generateToken,
} from '@mostly/core';
import { createApp } from '@mostly/server';
import { MostlyClient } from '../packages/cli/src/client.js';
import { resolveGitContext } from '../packages/cli/src/git-inference.js';
import { normalizeGitUrl } from '@mostly/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Guard: skip if git is not available on PATH
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
// Constants
// ---------------------------------------------------------------------------
const TEST_WORKSPACE_ID = '01WS_GITINF_E2E_000000001';
const TEST_PRINCIPAL_ID = '01PR_GITINF_E2E_000000001';
const TEST_PRINCIPAL_HANDLE = 'e2e-git-agent';
const TEST_PRINCIPAL_EMAIL = 'dev@git-e2e.example.com';

// Fixture remote URL — does not need to be a real repo.
const FIXTURE_REMOTE = 'git@github.com:e2e-org/demo-repo.git';
const FIXTURE_NORMALIZED = normalizeGitUrl(FIXTURE_REMOTE); // github.com/e2e-org/demo-repo

// ---------------------------------------------------------------------------
// setupApp — mirrors smoke.test.ts but adds RepoLinkService
// ---------------------------------------------------------------------------
function setupApp() {
  const db = createInMemoryDb();
  const migrationsDir = join(__dirname, '..', 'packages', 'db', 'migrations');
  runMigrations(db, migrationsDir);

  const repos = createRepositories(db);
  const tx = createTransactionManager(db);

  const testAgentToken = generateToken('mat_');

  const now = new Date().toISOString();
  repos.workspaces.create({
    id: TEST_WORKSPACE_ID,
    slug: 'git-e2e',
    name: 'Git Inference E2E Workspace',
    agent_token_hash: sha256(testAgentToken),
    created_at: now,
    updated_at: now,
  });

  // Seed a principal whose email matches what the temp git repo will have set
  // as user.email. This allows actor inference to resolve to this principal.
  repos.principals.create({
    id: TEST_PRINCIPAL_ID,
    workspace_id: TEST_WORKSPACE_ID,
    handle: TEST_PRINCIPAL_HANDLE,
    kind: 'agent',
    display_name: 'Git E2E Agent',
    email: TEST_PRINCIPAL_EMAIL,
    metadata_json: null,
    password_hash: null,
    is_active: true,
    is_admin: false,
    created_at: now,
    updated_at: now,
  });

  const principalService = new PrincipalService(repos.principals);
  const projectService = new ProjectService(repos.projects);
  const taskService = new TaskService(repos.tasks, repos.taskUpdates, repos.projects, tx);
  const maintenanceService = new MaintenanceService(repos.tasks, repos.taskUpdates, tx);
  const authService = new AuthService(
    repos.principals,
    repos.workspaces,
    repos.sessions,
    repos.apiKeys,
  );
  const repoLinkService = new RepoLinkService(repos.projectRepoLinks, repos.projects);

  const app = createApp({
    workspaceId: TEST_WORKSPACE_ID,
    principalService,
    projectService,
    taskService,
    maintenanceService,
    authService,
    repoLinkService,
  });

  return { app, testAgentToken };
}

// ---------------------------------------------------------------------------
// withTempGitRepo helper — lifted from Task 19 integration test
// ---------------------------------------------------------------------------
interface TempRepoOpts {
  remote?: string;
  branch?: string;
  email?: string;
}

function withTempGitRepo(opts: TempRepoOpts): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'mostly-e2e-'));
  const sh = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  sh('init', '-q');
  sh('config', 'commit.gpgsign', 'false');
  sh('config', 'user.name', 'E2E Test');
  sh('config', 'user.email', opts.email ?? 'test@example.com');
  if (opts.remote) sh('remote', 'add', 'origin', opts.remote);
  // Create an initial commit so HEAD is resolvable
  writeFileSync(path.join(dir, '.gitkeep'), '');
  sh('add', '.gitkeep');
  sh('commit', '-q', '-m', 'init');
  if (opts.branch) sh('checkout', '-q', '-B', opts.branch);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// In-process fetch adapter — same pattern as Task 19 integration test
// ---------------------------------------------------------------------------
function makeInProcessFetch(app: ReturnType<typeof setupApp>['app']) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const stripped = url.replace(/^https?:\/\/[^/]+/, '');
    return app.request(stripped, init as RequestInit);
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe.skipIf(!GIT_AVAILABLE)('E2E: git-aware project inference golden path', () => {
  const { app, testAgentToken } = setupApp();

  const BASE_URL = 'http://localhost';
  const originalFetch = globalThis.fetch;

  // Patch fetch before the scenario; restore after
  const patchedFetch = makeInProcessFetch(app) as typeof fetch;

  let tempRepo: { dir: string; cleanup: () => void } | null = null;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (tempRepo) {
      tempRepo.cleanup();
      tempRepo = null;
    }
  });

  it('link → resolveGitContext → task create end-to-end', async () => {
    globalThis.fetch = patchedFetch;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${testAgentToken}`,
      'Content-Type': 'application/json',
    };

    // ------------------------------------------------------------------
    // Step 1: Create project DEMO via HTTP API
    // ------------------------------------------------------------------
    const projRes = await app.request('/v0/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        key: 'DEMO',
        name: 'Demo Project',
        actor_id: TEST_PRINCIPAL_ID,
      }),
    });
    expect(projRes.status, 'create project should succeed').toBe(200);
    const project = (await projRes.json() as any).data;
    expect(project.key).toBe('DEMO');

    // ------------------------------------------------------------------
    // Step 2: Create temp git repo
    //   - origin points to FIXTURE_REMOTE
    //   - user.email matches the seeded principal
    //   - branch is DEMO-1-x so task inference can pick up DEMO-1
    // ------------------------------------------------------------------
    tempRepo = withTempGitRepo({
      remote: FIXTURE_REMOTE,
      branch: 'DEMO-1-x',
      email: TEST_PRINCIPAL_EMAIL,
    });

    // ------------------------------------------------------------------
    // Step 3: POST /v0/projects/DEMO/repo-links with the normalised URL
    // ------------------------------------------------------------------
    const linkRes = await app.request(`/v0/projects/${project.id}/repo-links`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        normalized_url: FIXTURE_NORMALIZED,
        subpath: '',
        actor_id: TEST_PRINCIPAL_ID,
      }),
    });
    expect(linkRes.status, 'create repo-link should succeed').toBe(200);
    const link = (await linkRes.json() as any).data;
    expect(link.normalized_url).toBe(FIXTURE_NORMALIZED);

    // ------------------------------------------------------------------
    // Step 4: resolveGitContext against the temp repo via in-process server
    // ------------------------------------------------------------------
    const client = new MostlyClient({
      serverUrl: BASE_URL,
      agentToken: testAgentToken,
      actor: TEST_PRINCIPAL_HANDLE,
    });

    const inf = await resolveGitContext({
      cwd: tempRepo.dir,
      client,
      disabled: false,
    });

    // Project inferred from the remote URL → repo-link → DEMO
    expect(inf.projectKey, 'should infer project DEMO').toBe('DEMO');
    expect(inf.source.project).toBe('git:resolve');

    // Task inferred from branch name DEMO-1-x → DEMO-1
    expect(inf.taskKey, 'should infer task DEMO-1').toBe('DEMO-1');
    expect(inf.source.task).toBe('git:branch');

    // Actor inferred from git user.email matching the seeded principal
    expect(inf.actorHandle, 'should infer actor handle').toBe(TEST_PRINCIPAL_HANDLE);
    expect(inf.source.actor).toBe('git:email');

    // ------------------------------------------------------------------
    // Step 5: POST /v0/tasks using the inferred project_id; assert task
    //         lands in project DEMO.
    // ------------------------------------------------------------------
    const taskRes = await app.request('/v0/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'Inferred task',
        type: 'chore',
        project_id: inf.projectId ?? project.id,
        actor_id: TEST_PRINCIPAL_ID,
      }),
    });
    expect(taskRes.status, 'create task should succeed').toBe(200);
    const task = (await taskRes.json() as any).data;
    expect(task.project_id, 'task should belong to project DEMO').toBe(project.id);
    // The key should be DEMO-N (first task in the project → DEMO-1)
    expect(task.key, 'task key should be in DEMO project').toMatch(/^DEMO-\d+$/);
  });
});
