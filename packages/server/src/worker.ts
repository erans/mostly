import { createD1Db, createRepositories, createD1TransactionManager } from '@mostly/db';
import { PrincipalService, ProjectService, TaskService, MaintenanceService, AuthService } from '@mostly/core';
import { createApp } from './app.js';
import { isSpaFallbackPath } from './spa-fallback.js';

interface Env {
  DB: unknown;
  WORKSPACE_ID: string;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

type D1Arg = Parameters<typeof createD1Db>[0];

/**
 * Decide whether the worker should defer a given response to the static
 * assets binding. The `run_worker_first = ["/v0/*"]` glob in wrangler.toml
 * is the primary router; this helper is a safety net for cases where the
 * worker receives a non-API request anyway (e.g., if someone removes the
 * glob or the runtime evaluates it inconsistently).
 */
export function shouldFallThroughToAssets(response: Response, request: Request, url: URL): boolean {
  return response.status === 404 && isSpaFallbackPath(request.method, url.pathname);
}

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

    const response = await app.fetch(request, env);
    if (shouldFallThroughToAssets(response, request, new URL(request.url))) {
      return env.ASSETS.fetch(request);
    }
    return response;
  },
};
