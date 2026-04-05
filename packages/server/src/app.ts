import { Hono } from 'hono';
import type { PrincipalService, ProjectService, TaskService, MaintenanceService } from '@mostly/core';
import { errorHandler, authMiddleware, actorMiddleware } from './middleware/index.js';
import { principalRoutes, projectRoutes } from './routes/index.js';

export type AppEnv = {
  Variables: {
    workspaceId: string;
    actorId: string;
    principalService: PrincipalService;
    projectService: ProjectService;
    taskService: TaskService;
    maintenanceService: MaintenanceService;
    parsedBody: Record<string, unknown>;
  };
};

export interface AppDependencies {
  workspaceId: string;
  token: string;
  principalService: PrincipalService;
  projectService: ProjectService;
  taskService: TaskService;
  maintenanceService: MaintenanceService;
}

export function createApp(deps: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Error handler (outermost — catches DomainError and maps to HTTP status)
  app.onError(errorHandler);

  // Inject services and workspace into context
  app.use('*', async (c, next) => {
    c.set('workspaceId', deps.workspaceId);
    c.set('principalService', deps.principalService);
    c.set('projectService', deps.projectService);
    c.set('taskService', deps.taskService);
    c.set('maintenanceService', deps.maintenanceService);
    await next();
  });

  // Auth middleware — validates bearer token
  app.use('*', authMiddleware(deps.token));

  // Actor resolution — resolves actor from body on mutating requests
  app.use('*', actorMiddleware());

  // API routes
  app.route('/v0/principals', principalRoutes());
  app.route('/v0/projects', projectRoutes());

  return app;
}
