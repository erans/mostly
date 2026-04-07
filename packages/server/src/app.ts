import { Hono } from 'hono';
import type { PrincipalService, ProjectService, TaskService, MaintenanceService, AuthService } from '@mostly/core';
import { errorHandler, authMiddleware, actorMiddleware } from './middleware/index.js';
import { principalRoutes, projectRoutes, taskRoutes, maintenanceRoutes, authRoutes } from './routes/index.js';

export type AuthMethod = 'session' | 'api_key' | 'agent_token';

export type AppEnv = {
  Variables: {
    workspaceId: string;
    actorId: string;
    authMethod: AuthMethod;
    principalService: PrincipalService;
    projectService: ProjectService;
    taskService: TaskService;
    maintenanceService: MaintenanceService;
    authService: AuthService;
    parsedBody: Record<string, unknown>;
  };
};

export interface AppDependencies {
  workspaceId: string;
  principalService: PrincipalService;
  projectService: ProjectService;
  taskService: TaskService;
  maintenanceService: MaintenanceService;
  authService: AuthService;
}

export function createApp(deps: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Error handler (outermost — catches DomainError and maps to HTTP status)
  app.onError(errorHandler);

  // Health check — no auth required
  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  // Inject services and workspace into context
  app.use('*', async (c, next) => {
    c.set('workspaceId', deps.workspaceId);
    c.set('actorId', '');
    c.set('authMethod', 'session' as AuthMethod);
    c.set('parsedBody', {});
    c.set('principalService', deps.principalService);
    c.set('projectService', deps.projectService);
    c.set('taskService', deps.taskService);
    c.set('maintenanceService', deps.maintenanceService);
    c.set('authService', deps.authService);
    await next();
  });

  // Auth routes — mounted BEFORE the auth middleware so register/login can run unauthenticated.
  // The authenticated routes inside (me, logout, api-keys, invite) check auth themselves.
  app.route('/v0/auth', authRoutes());

  // Auth middleware — validates session cookie, API key, or agent token
  app.use('/v0/*', authMiddleware());

  // Actor resolution — resolves actor from body on mutating requests (agents only)
  app.use('/v0/*', actorMiddleware());

  // API routes
  app.route('/v0/principals', principalRoutes());
  app.route('/v0/projects', projectRoutes());
  app.route('/v0/tasks', taskRoutes());
  app.route('/v0/maintenance', maintenanceRoutes());

  return app;
}
