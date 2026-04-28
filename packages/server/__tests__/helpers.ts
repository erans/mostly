import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createInMemoryDb, runMigrations, createRepositories, createTransactionManager } from '@mostly/db';
import { PrincipalService, ProjectService, TaskService, MaintenanceService, AuthService, RepoLinkService, sha256, generateToken } from '@mostly/core';
import { createApp } from '../src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_WORKSPACE_ID = '01TEST_WORKSPACE_000000001';
const TEST_PRINCIPAL_ID = '01TEST_PRINCIPAL_000000001';
const TEST_PRINCIPAL_HANDLE = 'test-agent';

export function createTestApp() {
  const db = createInMemoryDb();
  const migrationsDir = join(__dirname, '..', '..', 'db', 'migrations');
  runMigrations(db, migrationsDir);

  const repos = createRepositories(db);
  const tx = createTransactionManager(db);

  // Each test app gets a fresh random agent token so cross-test isolation
  // doesn't depend on a hardcoded value.
  const testAgentToken = generateToken('mat_');

  // Seed default workspace with agent token
  const now = new Date().toISOString();
  repos.workspaces.create({
    id: TEST_WORKSPACE_ID,
    slug: 'default',
    name: 'Test Workspace',
    agent_token_hash: sha256(testAgentToken),
    created_at: now,
    updated_at: now,
  });

  // Seed test principal
  repos.principals.create({
    id: TEST_PRINCIPAL_ID,
    workspace_id: TEST_WORKSPACE_ID,
    handle: TEST_PRINCIPAL_HANDLE,
    kind: 'agent',
    display_name: 'Test Agent',
    metadata_json: null,
    password_hash: null,
    is_active: true,
    is_admin: false,
    created_at: now,
    updated_at: now,
  });

  // Create services
  const principalService = new PrincipalService(repos.principals);
  const projectService = new ProjectService(repos.projects);
  const taskService = new TaskService(repos.tasks, repos.taskUpdates, repos.projects, tx);
  const maintenanceService = new MaintenanceService(repos.tasks, repos.taskUpdates, tx);
  const authService = new AuthService(repos.principals, repos.workspaces, repos.sessions, repos.apiKeys);
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

  return {
    app,
    db,
    repos,
    workspaceId: TEST_WORKSPACE_ID,
    testPrincipalId: TEST_PRINCIPAL_ID,
    testPrincipalHandle: TEST_PRINCIPAL_HANDLE,
    testAgentToken,
    principalService,
    projectService,
    taskService,
    maintenanceService,
    authService,
    repoLinkService,
  };
}
