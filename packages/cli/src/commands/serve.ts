import { Command } from 'commander';
import { serve } from '@hono/node-server';
import { createLocalDb, runMigrations, createRepositories, createTransactionManager } from '@mostly/db';
import { PrincipalService, ProjectService, TaskService, MaintenanceService } from '@mostly/core';
import { createApp } from '@mostly/server';
import { configExists, loadConfig, getDbPath } from '../config.js';
import { getMigrationsDir } from '../migrations.js';
import { ulid } from 'ulid';

const DEFAULT_PORT = 6080;

export function serveCommand(): Command {
  return new Command('serve')
    .description('Start local API server')
    .option('-p, --port <number>', 'Port to listen on', String(DEFAULT_PORT))
    .action(async (opts) => {
      // 1. Check config exists
      if (!configExists()) {
        console.error('No config found. Run "mostly init" first.');
        process.exit(1);
      }

      // 2. Load config
      const config = loadConfig();
      const port = parseInt(opts.port, 10) || DEFAULT_PORT;
      const dbPath = getDbPath();

      // 3. Create and migrate database
      const db = createLocalDb(dbPath);
      const migrationsDir = getMigrationsDir();
      runMigrations(db, migrationsDir);

      // Seed default workspace if none exists
      const repos = createRepositories(db);
      const tx = createTransactionManager(db);

      let workspace;
      try {
        workspace = await repos.workspaces.getDefault();
      } catch {
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

      // 4. Wire up services and app
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

      // 5. Start server
      console.log(`Mostly server starting on port ${port}...`);
      serve({
        fetch: app.fetch,
        port,
      });
      console.log(`Mostly server running at http://localhost:${port}`);
    });
}
