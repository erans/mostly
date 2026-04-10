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
  const migrationsDir = join(__dirname, '..', 'packages', 'db', 'migrations');
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

  // Check if already seeded
  const humans = await repos.principals.listHumans(workspace.id);
  if (humans.length > 0) {
    console.log('Demo data already exists, skipping seed.');
    return;
  }

  console.log('Seeding demo data...');

  // 1. Register admin user (first user is automatically admin)
  const { principal: admin } = await authService.register(workspace.id, {
    handle: 'admin',
    password: 'admin',
    display_name: 'Admin',
  });
  console.log(`  Created admin user: ${admin.handle}`);

  // 2. Create demo project
  const project = await projectService.create(workspace.id, {
    key: 'DEMO',
    name: 'Demo Project',
    description: 'A sample project to explore Mostly',
  }, admin.id);
  console.log(`  Created project: ${project.key}`);

  // 3. Create sample tasks
  const taskInputs = [
    { type: 'feature', title: 'Design the landing page', description: 'Create wireframes and high-fidelity mockups for the main landing page.' },
    { type: 'bug', title: 'Fix login redirect loop', description: 'Users are redirected back to login after successful authentication on Safari.' },
    { type: 'chore', title: 'Update dependencies to latest versions', description: 'Run pnpm update and fix any breaking changes.' },
    { type: 'research', title: 'Evaluate real-time sync options', description: 'Compare WebSockets, SSE, and polling for live task updates.' },
  ];

  const createdTasks = [];
  for (const input of taskInputs) {
    const task = await taskService.create(workspace.id, {
      ...input,
      project_id: project.id,
      assignee_id: admin.id,
    }, admin.id);
    createdTasks.push(task);
    console.log(`  Created task: ${task.key} — ${task.title}`);
  }

  // 4. Transition the bug task to in_progress (via claimed first)
  const bugTask = createdTasks[1];
  await taskService.acquireClaim(bugTask.id, admin.id, null, bugTask.version);
  const claimedBug = await repos.tasks.findById(bugTask.id);
  if (claimedBug) {
    await taskService.transition(claimedBug.id, 'in_progress', null, claimedBug.version, admin.id);
  }
  console.log(`  Moved ${bugTask.key} to in_progress`);

  // 5. Close the chore task
  const choreTask = createdTasks[2];
  await taskService.transition(choreTask.id, 'closed', 'completed', choreTask.version, admin.id);
  console.log(`  Closed ${choreTask.key}`);

  console.log('Demo data seeded successfully!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
