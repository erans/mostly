import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createInMemoryDb, runMigrations, createRepositories, createTransactionManager } from '@mostly/db';
import { PrincipalService, ProjectService, TaskService, MaintenanceService } from '@mostly/core';
import { createApp } from '../src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_TOKEN = 'test-token-secret';
const TEST_WORKSPACE_ID = '01TEST_WORKSPACE_000000001';
const TEST_PRINCIPAL_ID = '01TEST_PRINCIPAL_000000001';
const TEST_PRINCIPAL_HANDLE = 'test-agent';

export function createTestApp() {
  const db = createInMemoryDb();
  const migrationsDir = join(__dirname, '..', '..', 'db', 'migrations');
  runMigrations(db, migrationsDir);

  const repos = createRepositories(db);
  const tx = createTransactionManager(db);

  // Seed default workspace
  const now = new Date().toISOString();
  repos.workspaces.create({
    id: TEST_WORKSPACE_ID,
    slug: 'test-workspace',
    name: 'Test Workspace',
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
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  // Create services
  const principalService = new PrincipalService(repos.principals);
  const projectService = new ProjectService(repos.projects);
  const taskService = new TaskService(repos.tasks, repos.taskUpdates, repos.projects, tx);
  const maintenanceService = new MaintenanceService(repos.tasks, repos.taskUpdates, tx);

  const app = createApp({
    workspaceId: TEST_WORKSPACE_ID,
    token: TEST_TOKEN,
    principalService,
    projectService,
    taskService,
    maintenanceService,
  });

  return {
    app,
    db,
    repos,
    workspaceId: TEST_WORKSPACE_ID,
    testPrincipalId: TEST_PRINCIPAL_ID,
    testPrincipalHandle: TEST_PRINCIPAL_HANDLE,
    testToken: TEST_TOKEN,
    principalService,
    projectService,
    taskService,
    maintenanceService,
  };
}
