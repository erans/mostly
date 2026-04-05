import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createInMemoryDb, runMigrations, createRepositories, createTransactionManager } from '@mostly/db';
import { PrincipalService, ProjectService, TaskService, MaintenanceService } from '@mostly/core';
import { createApp } from '@mostly/server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_TOKEN = 'e2e-smoke-token';
const TEST_WORKSPACE_ID = '01WS_SMOKE_TEST_00000001';
const TEST_PRINCIPAL_ID = '01PR_SMOKE_TEST_00000001';
const TEST_PRINCIPAL_HANDLE = 'smoke-agent';

function setupApp() {
  const db = createInMemoryDb();
  const migrationsDir = join(__dirname, '..', 'packages', 'db', 'migrations');
  runMigrations(db, migrationsDir);

  const repos = createRepositories(db);
  const tx = createTransactionManager(db);

  // Seed workspace
  const now = new Date().toISOString();
  repos.workspaces.create({
    id: TEST_WORKSPACE_ID,
    slug: 'smoke-test',
    name: 'Smoke Test Workspace',
    created_at: now,
    updated_at: now,
  });

  // Seed bootstrap principal (required by actor middleware)
  repos.principals.create({
    id: TEST_PRINCIPAL_ID,
    workspace_id: TEST_WORKSPACE_ID,
    handle: TEST_PRINCIPAL_HANDLE,
    kind: 'agent',
    display_name: 'Smoke Test Agent',
    metadata_json: null,
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  // Create services
  const principalService = new PrincipalService(repos.principals);
  const projectService = new ProjectService(repos.projects);
  const taskService = new TaskService(repos.tasks, repos.taskUpdates, repos.projects, tx);
  const maintenanceService = new MaintenanceService(repos.tasks, repos.taskUpdates);

  const app = createApp({
    workspaceId: TEST_WORKSPACE_ID,
    token: TEST_TOKEN,
    principalService,
    projectService,
    taskService,
    maintenanceService,
  });

  return { app };
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${TEST_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

describe('E2E Smoke Test', () => {
  it('completes full task lifecycle', async () => {
    const { app } = setupApp();
    const headers = authHeaders();

    // 1. Create a new principal via API
    const principalRes = await app.request('/v0/principals', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        handle: 'e2e-worker',
        kind: 'agent',
        display_name: 'E2E Worker Agent',
        actor_id: TEST_PRINCIPAL_ID,
      }),
    });
    expect(principalRes.status).toBe(200);
    const principal = (await principalRes.json() as any).data;
    expect(principal.handle).toBe('e2e-worker');
    expect(principal.kind).toBe('agent');
    expect(principal.is_active).toBe(true);

    // 2. Create a project via API
    const projRes = await app.request('/v0/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        key: 'SMOKE',
        name: 'Smoke Test Project',
        actor_id: TEST_PRINCIPAL_ID,
      }),
    });
    expect(projRes.status).toBe(200);
    const project = (await projRes.json() as any).data;
    expect(project.key).toBe('SMOKE');
    expect(project.name).toBe('Smoke Test Project');

    // 3. Create a task under the project
    const taskRes = await app.request('/v0/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'E2E smoke test task',
        type: 'feature',
        project_id: project.id,
        actor_id: TEST_PRINCIPAL_ID,
      }),
    });
    expect(taskRes.status).toBe(200);
    const task = (await taskRes.json() as any).data;
    expect(task.key).toBe('SMOKE-1');
    expect(task.status).toBe('open');
    expect(task.project_id).toBe(project.id);
    expect(task.version).toBe(1);

    // 4. Claim the task
    const claimRes = await app.request(`/v0/tasks/${task.id}/claim`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        expected_version: task.version,
        actor_id: TEST_PRINCIPAL_ID,
      }),
    });
    expect(claimRes.status).toBe(200);
    const claimed = (await claimRes.json() as any).data;
    expect(claimed.status).toBe('claimed');
    expect(claimed.claimed_by_id).toBe(TEST_PRINCIPAL_ID);

    // 5. Transition to in_progress
    const startRes = await app.request(`/v0/tasks/${task.id}/transition`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to_status: 'in_progress',
        expected_version: claimed.version,
        actor_id: TEST_PRINCIPAL_ID,
      }),
    });
    expect(startRes.status).toBe(200);
    const started = (await startRes.json() as any).data;
    expect(started.status).toBe('in_progress');

    // 6. Add a task update
    const updateRes = await app.request(`/v0/tasks/${task.id}/updates`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 'note',
        body: 'Implementation complete, running tests.',
        actor_id: TEST_PRINCIPAL_ID,
      }),
    });
    expect(updateRes.status).toBe(200);
    const update = (await updateRes.json() as any).data;
    expect(update.kind).toBe('note');
    expect(update.body).toBe('Implementation complete, running tests.');

    // 7. Close the task with resolution "completed"
    const closeRes = await app.request(`/v0/tasks/${task.id}/transition`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to_status: 'closed',
        resolution: 'completed',
        expected_version: started.version,
        actor_id: TEST_PRINCIPAL_ID,
      }),
    });
    expect(closeRes.status).toBe(200);
    const closed = (await closeRes.json() as any).data;
    expect(closed.status).toBe('closed');
    expect(closed.resolution).toBe('completed');
    expect(closed.resolved_at).not.toBeNull();

    // 8. Verify final task state via GET (by key)
    const getRes = await app.request(`/v0/tasks/${task.key}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json() as any).data;
    expect(fetched.status).toBe('closed');
    expect(fetched.key).toBe('SMOKE-1');
    expect(fetched.resolution).toBe('completed');
    expect(fetched.resolved_at).not.toBeNull();
    expect(fetched.title).toBe('E2E smoke test task');

    // 9. List task updates and verify count
    const listUpdatesRes = await app.request(`/v0/tasks/${task.id}/updates`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(listUpdatesRes.status).toBe(200);
    const updates = (await listUpdatesRes.json() as any).data;
    // Should have: system updates from transitions + our manual note
    expect(updates.items.length).toBeGreaterThanOrEqual(1);
    const noteUpdate = updates.items.find((u: any) => u.kind === 'note');
    expect(noteUpdate).toBeDefined();
    expect(noteUpdate.body).toBe('Implementation complete, running tests.');

    // 10. List tasks with status filter and verify the task appears
    const listRes = await app.request('/v0/tasks?status=closed', {
      method: 'GET',
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json() as any).data;
    expect(list.items.length).toBe(1);
    expect(list.items[0].key).toBe('SMOKE-1');
    expect(list.items[0].status).toBe('closed');
  });
});
