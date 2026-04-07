import { Command } from 'commander';
import { serve } from '@hono/node-server';
import {
  createLocalDb,
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
} from '@mostly/core';
import { createApp } from '@mostly/server';
import { configExists, getDbPath } from '../config.js';
import { getMigrationsDir } from '../migrations.js';
import { generateId, ID_PREFIXES } from '@mostly/types';

const DEFAULT_PORT = 6080;

export function serveCommand(): Command {
  return new Command('serve')
    .description('Start local API server')
    .option('-p, --port <number>', 'Port to listen on', String(DEFAULT_PORT))
    .action(async (opts) => {
      if (!configExists()) {
        console.error('No config found. Run "mostly init" first.');
        process.exit(1);
      }

      const port = parseInt(opts.port, 10) || DEFAULT_PORT;
      const dbPath = getDbPath();

      // Create and migrate database
      const db = createLocalDb(dbPath);
      const migrationsDir = getMigrationsDir();
      runMigrations(db, migrationsDir);

      const repos = createRepositories(db);
      const tx = createTransactionManager(db);

      // Seed default workspace if none exists
      let workspace;
      try {
        workspace = await repos.workspaces.getDefault();
      } catch {
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

      // Wire up services
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

      const app = createApp({
        workspaceId: workspace.id,
        principalService,
        projectService,
        taskService,
        maintenanceService,
        authService,
      });

      console.log(`Mostly server starting on port ${port}...`);
      serve({ fetch: app.fetch, port });
      console.log(`Mostly server running at http://localhost:${port}`);
    });
}
