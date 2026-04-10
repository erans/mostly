import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createLocalDb, runMigrations, createRepositories, createTransactionManager } from '@mostly/db';
import { PrincipalService, ProjectService, TaskService, MaintenanceService, AuthService, sha256 } from '@mostly/core';
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
  agent_token?: string;
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
  const port = process.env.MOSTLY_PORT
    ? parsePort(process.env.MOSTLY_PORT)
    : fileConfig.port != null
      ? parsePort(String(fileConfig.port))
      : DEFAULT_PORT;

  return { port, server_url: fileConfig.server_url, agent_token: fileConfig.agent_token };
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
  const authService = new AuthService(repos.principals, repos.workspaces, repos.sessions, repos.apiKeys);

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
          password_hash: null,
          is_active: true,
          is_admin: false,
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

  // Install bootstrap agent token if env var is set (for Docker E2E and other
  // headless setups). Only takes effect when the workspace has no existing
  // hash — we never overwrite a token that the CLI init flow (or a previous
  // bootstrap) already wrote, to protect production deployments from an
  // accidentally-set env var clobbering live credentials.
  if (process.env.MOSTLY_BOOTSTRAP_AGENT_TOKEN) {
    const existingHash = await repos.workspaces.getAgentTokenHash(workspace.id);
    if (existingHash) {
      console.warn(
        'Bootstrap agent token env var set but workspace already has an agent_token_hash; env var ignored',
      );
    } else {
      await repos.workspaces.update(workspace.id, {
        agent_token_hash: sha256(process.env.MOSTLY_BOOTSTRAP_AGENT_TOKEN),
        updated_at: new Date().toISOString(),
      });
      console.log(`Bootstrap agent token installed for workspace ${workspace.id}`);
    }
  }

  const app = createApp({
    workspaceId: workspace.id,
    principalService,
    projectService,
    taskService,
    maintenanceService,
    authService,
  });

  // Serve pre-built web UI from public/ if it exists (Docker builds copy it there)
  const publicDir = join(__dirname, '..', 'public');
  if (existsSync(publicDir)) {
    app.use('*', serveStatic({ root: publicDir }));
    // SPA fallback: non-API GET/HEAD requests that didn't match a static file get index.html
    app.use('*', async (c, next) => {
      if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
        return next();
      }
      if (c.req.path === '/v0' || c.req.path.startsWith('/v0/') || c.req.path === '/healthz') {
        return next();
      }
      return serveStatic({ root: publicDir, path: 'index.html' })(c, next);
    });
    console.log(`Serving web UI from ${publicDir}`);
  }

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
