import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLocalDb, runMigrations, createRepositories, createTransactionManager } from '@mostly/db';
import { PrincipalService, ProjectService, TaskService, MaintenanceService, AuthService } from '@mostly/core';
import { NotFoundError, generateId, ID_PREFIXES } from '@mostly/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = process.env.MOSTLY_DB_PATH ?? '/data/mostly.db';

async function seed() {
  // Ensure DB directory exists
  const dbDir = dirname(DB_PATH);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = createLocalDb(DB_PATH);
  // When compiled by tsup into packages/server/dist/, __dirname is /app/packages/server/dist
  const migrationsDir = join(__dirname, '..', '..', 'db', 'migrations');
  runMigrations(db, migrationsDir);

  const repos = createRepositories(db);
  const tx = createTransactionManager(db);

  // Ensure default workspace
  let workspace;
  try {
    workspace = await repos.workspaces.getDefault();
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
    const now = new Date().toISOString();
    workspace = await repos.workspaces.create({
      id: generateId(ID_PREFIXES.workspace),
      slug: 'default',
      name: 'Default Workspace',
      created_at: now,
      updated_at: now,
    });
    console.log(`Created default workspace: ${workspace.id}`);
  }

  const authService = new AuthService(repos.principals, repos.workspaces, repos.sessions, repos.apiKeys);
  const projectService = new ProjectService(repos.projects);
  const taskService = new TaskService(repos.tasks, repos.taskUpdates, repos.projects, tx);

  console.log('Seeding demo data...');

  // 1. Get or create admin user. Temporarily enable registration in case the
  //    workspace already has human users (e.g. from a shared volume).
  let admin = await repos.principals.findByHandle(workspace.id, 'admin');
  if (!admin) {
    const ws = await repos.workspaces.findById(workspace.id);
    const wasOpen = ws?.allow_registration ?? false;
    if (!wasOpen) {
      await repos.workspaces.update(workspace.id, { allow_registration: true, updated_at: new Date().toISOString() });
    }
    const result = await authService.register(workspace.id, {
      handle: 'admin',
      password: 'admin',
      display_name: 'Admin',
    });
    admin = result.principal;
    if (!wasOpen) {
      await repos.workspaces.update(workspace.id, { allow_registration: false, updated_at: new Date().toISOString() });
    }
    // Ensure the seeded admin has admin privileges
    if (!admin.is_admin) {
      await repos.principals.update(admin.id, { is_admin: true, updated_at: new Date().toISOString() });
      admin = (await repos.principals.findByHandle(workspace.id, 'admin'))!;
    }
    console.log(`  Created admin user: ${admin.handle}`);
  } else {
    console.log(`  Admin user already exists: ${admin.handle}`);
  }

  // 2. Get or create demo project
  let project = await repos.projects.findByKey(workspace.id, 'DEMO');
  if (!project) {
    project = await projectService.create(workspace.id, {
      key: 'DEMO',
      name: 'Demo Project',
      description: 'A sample project to explore Mostly',
    }, admin.id);
    console.log(`  Created project: ${project.key}`);
  } else {
    console.log(`  Project already exists: ${project.key}`);
  }

  // 3. Seed demo tasks only if the project has no tasks yet.
  //    Uses taskService.create() to keep key_sequence in sync.
  //    If the container crashes mid-seed, `docker compose down -v` resets cleanly.
  const existing = await repos.tasks.list(workspace.id, { project_id: project.id }, undefined, 1);
  if (existing.items.length > 0) {
    console.log('  Demo tasks already exist, skipping task seed.');
  } else {
    const taskInputs = [
      { type: 'feature', title: 'Design the landing page', description: 'Create wireframes and high-fidelity mockups for the main landing page.' },
      { type: 'bug', title: 'Fix login redirect loop', description: 'Users are redirected back to login after successful authentication on Safari.' },
      { type: 'chore', title: 'Update dependencies to latest versions', description: 'Run pnpm update and fix any breaking changes.' },
      { type: 'research', title: 'Evaluate real-time sync options', description: 'Compare WebSockets, SSE, and polling for live task updates.' },
    ];

    const tasks = [];
    for (const input of taskInputs) {
      const task = await taskService.create(workspace.id, {
        ...input,
        project_id: project.id,
        assignee_id: admin.id,
      }, admin.id);
      tasks.push(task);
      console.log(`  Created task: ${task.key} — ${task.title}`);
    }

    // Transition bug task to in_progress
    const bugTask = tasks[1];
    await taskService.acquireClaim(bugTask.id, admin.id, null, bugTask.version);
    const claimed = await repos.tasks.findById(bugTask.id);
    if (claimed) {
      await taskService.transition(claimed.id, 'in_progress', null, claimed.version, admin.id);
    }
    console.log(`  Moved ${bugTask.key} to in_progress`);

    // Close the chore task
    const choreTask = tasks[2];
    await taskService.transition(choreTask.id, 'closed', 'completed', choreTask.version, admin.id);
    console.log(`  Closed ${choreTask.key}`);
  }

  console.log('Demo data seeded successfully!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
