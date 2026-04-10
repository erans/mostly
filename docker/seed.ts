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

  // 1. Get or create admin user
  let admin = await repos.principals.findByHandle(workspace.id, 'admin');
  if (!admin) {
    const result = await authService.register(workspace.id, {
      handle: 'admin',
      password: 'admin',
      display_name: 'Admin',
    });
    admin = result.principal;
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

  // 3. Seed demo tasks — match existing ones by title within the DEMO project.
  //    Title collisions with user-created tasks in this project are unlikely
  //    given the specificity of these demo titles.
  const existingTasks = await repos.tasks.list(workspace.id, { project_id: project.id });
  const existingByTitle = new Map(existingTasks.items.map(t => [t.title, t]));

  const taskSpecs = [
    { type: 'feature', title: 'Design the landing page', description: 'Create wireframes and high-fidelity mockups for the main landing page.' },
    { type: 'bug', title: 'Fix login redirect loop', description: 'Users are redirected back to login after successful authentication on Safari.', targetStatus: 'in_progress' as const },
    { type: 'chore', title: 'Update dependencies to latest versions', description: 'Run pnpm update and fix any breaking changes.', targetStatus: 'closed' as const, resolution: 'completed' as const },
    { type: 'research', title: 'Evaluate real-time sync options', description: 'Compare WebSockets, SSE, and polling for live task updates.' },
  ];

  for (const spec of taskSpecs) {
    const existing = existingByTitle.get(spec.title);

    let task;
    if (existing) {
      task = existing;
      console.log(`  Task already exists: ${task.key} — ${task.title}`);
    } else {
      task = await taskService.create(workspace.id, {
        type: spec.type,
        title: spec.title,
        description: spec.description,
        project_id: project.id,
        assignee_id: admin.id,
      }, admin.id);
      console.log(`  Created task: ${task.key} — ${task.title}`);
    }

    // Apply transitions for tasks still in 'open' state (covers both fresh
    // creates and partial seeds where the task was created but the transition
    // failed). Tasks that users have manually moved to other states are left
    // untouched.
    if (spec.targetStatus && task.status === 'open') {
      if (spec.targetStatus === 'in_progress') {
        await taskService.acquireClaim(task.id, admin.id, null, task.version);
        const claimed = await repos.tasks.findById(task.id);
        if (claimed) {
          await taskService.transition(claimed.id, 'in_progress', null, claimed.version, admin.id);
        }
        console.log(`  Moved ${task.key} to in_progress`);
      } else if (spec.targetStatus === 'closed') {
        await taskService.transition(task.id, 'closed', spec.resolution ?? null, task.version, admin.id);
        console.log(`  Closed ${task.key}`);
      }
    }
  }

  console.log('Demo data seeded successfully!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
