import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { serve } from '@hono/node-server';
import { createLocalDb, runMigrations, createRepositories, createTransactionManager } from '@mostly/db';
import { PrincipalService, ProjectService, TaskService, MaintenanceService } from '@mostly/core';
import { NotFoundError, generateId, ID_PREFIXES } from '@mostly/types';
import { createApp } from './app.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MOSTLY_DIR = process.env.MOSTLY_DIR ?? join(homedir(), '.mostly');
const CONFIG_PATH = join(MOSTLY_DIR, 'config');
const DB_PATH = process.env.MOSTLY_DB_PATH ?? join(MOSTLY_DIR, 'mostly.db');
const DEFAULT_PORT = 6080;

interface MostlyConfig {
  port?: number;
  token: string;
  server_url?: string;
}

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) {
    console.error(`Invalid port: ${value}. Must be an integer between 1 and 65535.`);
    process.exit(1);
  }
  const port = Number(value);
  if (port < 1 || port > 65535) {
    console.error(`Invalid port: ${value}. Must be an integer between 1 and 65535.`);
    process.exit(1);
  }
  return port;
}

function loadConfig(): MostlyConfig {
  // Load base config from file (if it exists)
  const fileConfig: Partial<MostlyConfig> = existsSync(CONFIG_PATH)
    ? JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
    : {};

  // Env vars override file config
  const token = process.env.MOSTLY_TOKEN ?? fileConfig.token;
  if (!token) {
    console.error(`No token configured. Set MOSTLY_TOKEN env var or run 'mostly init'.`);
    process.exit(1);
  }

  const port = process.env.MOSTLY_PORT
    ? parsePort(process.env.MOSTLY_PORT)
    : fileConfig.port != null
      ? parsePort(String(fileConfig.port))
      : DEFAULT_PORT;

  return { token, port, server_url: fileConfig.server_url };
}

async function main() {
  const config = loadConfig();
  const port = config.port ?? DEFAULT_PORT;

  // Ensure DB parent directory exists
  const dbDir = dirname(DB_PATH);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
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
      id: generateId(ID_PREFIXES.workspace),
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
  const maintenanceService = new MaintenanceService(repos.tasks, repos.taskUpdates, tx);

  // Seed bootstrap principal if env var is set (for Docker E2E testing)
  if (process.env.MOSTLY_BOOTSTRAP_ACTOR) {
    const handle = process.env.MOSTLY_BOOTSTRAP_ACTOR;
    try {
      await principalService.getByHandle(workspace.id, handle);
      console.log(`Bootstrap principal '${handle}' already exists`);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      try {
        const now = new Date().toISOString();
        await repos.principals.create({
          id: generateId(ID_PREFIXES.principal),
          workspace_id: workspace.id,
          handle,
          kind: 'agent',
          display_name: `Bootstrap Agent (${handle})`,
          metadata_json: null,
          is_active: true,
          created_at: now,
          updated_at: now,
        });
        console.log(`Created bootstrap principal: ${handle}`);
      } catch {
        // Ignore unique constraint errors from concurrent startup race
        const existing = await principalService.getByHandle(workspace.id, handle);
        console.log(`Bootstrap principal '${handle}' already exists (concurrent create)`);
      }
    }
  }

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
