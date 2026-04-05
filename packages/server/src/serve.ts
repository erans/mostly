import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { serve } from '@hono/node-server';
import { createLocalDb, runMigrations, createRepositories, createTransactionManager } from '@mostly/db';
import { PrincipalService, ProjectService, TaskService, MaintenanceService } from '@mostly/core';
import { NotFoundError } from '@mostly/types';
import { createApp } from './app.js';
import { ulid } from 'ulid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MOSTLY_DIR = join(homedir(), '.mostly');
const CONFIG_PATH = join(MOSTLY_DIR, 'config');
const DB_PATH = join(MOSTLY_DIR, 'mostly.db');
const DEFAULT_PORT = 6080;

interface MostlyConfig {
  port?: number;
  token: string;
  server_url?: string;
}

function loadConfig(): MostlyConfig {
  if (!existsSync(CONFIG_PATH)) {
    console.error(`Config not found at ${CONFIG_PATH}. Run 'mostly init' first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

async function main() {
  const config = loadConfig();
  const port = config.port ?? DEFAULT_PORT;

  // Ensure ~/.mostly/ directory exists
  if (!existsSync(MOSTLY_DIR)) {
    mkdirSync(MOSTLY_DIR, { recursive: true });
  }

  // Create and migrate database
  const db = createLocalDb(DB_PATH);

  // Migrations path: relative to this file in dist/, the db migrations are at ../../db/migrations
  // But when running from source, they're at packages/db/migrations
  // Use a path relative to the monorepo structure
  const migrationsDir = join(__dirname, '..', '..', 'db', 'migrations');
  runMigrations(db, migrationsDir);

  // Create repositories and services
  const repos = createRepositories(db);
  const tx = createTransactionManager(db);

  // Seed default workspace if none exists
  let workspace;
  try {
    workspace = await repos.workspaces.getDefault();
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
    const now = new Date().toISOString();
    workspace = await repos.workspaces.create({
      id: ulid(),
      slug: 'default',
      name: 'Default Workspace',
      created_at: now,
      updated_at: now,
    });
    console.log(`Created default workspace: ${workspace.id}`);
  }

  const principalService = new PrincipalService(repos.principals);
  const projectService = new ProjectService(repos.projects);
  const taskService = new TaskService(repos.tasks, repos.taskUpdates, repos.projects, tx);
  const maintenanceService = new MaintenanceService(repos.tasks, repos.taskUpdates);

  const app = createApp({
    workspaceId: workspace.id,
    token: config.token,
    principalService,
    projectService,
    taskService,
    maintenanceService,
  });

  console.log(`Mostly server starting on port ${port}...`);
  serve({
    fetch: app.fetch,
    port,
  });
  console.log(`Mostly server running at http://localhost:${port}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
