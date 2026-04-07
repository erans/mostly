import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.js';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function actorMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const method = c.req.method;
    const authMethod = c.get('authMethod');

    // For human-authenticated requests (session or API key), actorId is already set
    if (authMethod === 'session' || authMethod === 'api_key') {
      if (MUTATING_METHODS.has(method)) {
        // Parse body for route handlers, but don't require actor fields
        let body: Record<string, unknown>;
        try {
          body = await c.req.json();
        } catch {
          body = {};
        }
        c.set('parsedBody' as any, body);
      }
      await next();
      return;
    }

    // For agent-authenticated requests, resolve actor from body (same as before)
    if (MUTATING_METHODS.has(method)) {
      let body: Record<string, unknown>;
      try {
        body = await c.req.json();
      } catch {
        body = {};
      }

      c.set('parsedBody' as any, body);

      const actorId = body.actor_id as string | undefined;
      const actorHandle = body.actor_handle as string | undefined;

      if (!actorId && !actorHandle) {
        return c.json(
          { error: { code: 'invalid_argument', message: 'actor_id or actor_handle is required' } },
          400,
        );
      }

      const principalService = c.get('principalService');
      const workspaceId = c.get('workspaceId');

      try {
        let principal;
        if (actorId) {
          principal = await principalService.get(actorId);
          if (principal.workspace_id !== workspaceId) {
            return c.json(
              { error: { code: 'not_found', message: `principal not found: ${actorId}` } },
              404,
            );
          }
        } else {
          principal = await principalService.getByHandle(workspaceId, actorHandle!);
        }

        if (!principal.is_active) {
          return c.json(
            { error: { code: 'invalid_argument', message: 'Actor principal is not active' } },
            400,
          );
        }

        c.set('actorId', principal.id);
      } catch (err) {
        throw err;
      }
    }

    await next();
  };
}
