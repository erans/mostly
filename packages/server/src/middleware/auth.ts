import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.js';

export function authMiddleware(token: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json(
        { error: { code: 'unauthorized', message: 'Missing Authorization header' } },
        401,
      );
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || parts[1] !== token) {
      return c.json(
        { error: { code: 'unauthorized', message: 'Invalid bearer token' } },
        401,
      );
    }

    await next();
  };
}
