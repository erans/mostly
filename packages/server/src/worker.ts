import { createD1Db, createRepositories, createD1TransactionManager } from '@mostly/db';
import { PrincipalService, ProjectService, TaskService, MaintenanceService, AuthService } from '@mostly/core';
import { createApp } from './app.js';

interface Env {
  DB: unknown;
  WORKSPACE_ID: string;
}

type D1Arg = Parameters<typeof createD1Db>[0];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = createD1Db(env.DB as D1Arg);
    const repos = createRepositories(db);
    const tx = createD1TransactionManager(db);

    const principalService = new PrincipalService(repos.principals);
    const projectService = new ProjectService(repos.projects);
    const taskService = new TaskService(repos.tasks, repos.taskUpdates, repos.projects, tx);
    const maintenanceService = new MaintenanceService(repos.tasks, repos.taskUpdates, tx);
    const authService = new AuthService(repos.principals, repos.workspaces, repos.sessions, repos.apiKeys);

    const app = createApp({
      workspaceId: env.WORKSPACE_ID,
      principalService,
      projectService,
      taskService,
      maintenanceService,
      authService,
    });

    return app.fetch(request, env);
  },
};
