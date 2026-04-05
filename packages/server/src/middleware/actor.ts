import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.js';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function actorMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const method = c.req.method;

    if (MUTATING_METHODS.has(method)) {
      // For mutating requests, resolve actor from request body
      let body: Record<string, unknown>;
      try {
        body = await c.req.json();
      } catch {
        body = {};
      }

      // Store the parsed body so route handlers don't have to re-parse
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
        // Let domain errors (e.g. NotFoundError) propagate to the error handler
        throw err;
      }
    }

    await next();
  };
}
