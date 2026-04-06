import { Hono } from 'hono';
import type { AppEnv } from '../app.js';

export function maintenanceRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // POST /v0/maintenance/reap-expired-claims
  routes.post('/reap-expired-claims', async (c) => {
    const maintenanceService = c.get('maintenanceService');
    const workspaceId = c.get('workspaceId');

    const count = await maintenanceService.reapExpiredClaims(workspaceId);
    return c.json({ data: { reaped: count } });
  });

  return routes;
}
