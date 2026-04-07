import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv, AuthMethod } from '../app.js';

export function authMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const authService = c.get('authService');
    const workspaceId = c.get('workspaceId');

    // 1. Try session cookie
    const sessionId = getCookie(c, 'mostly_session');
    if (sessionId) {
      const result = await authService.validateSession(sessionId);
      if (result) {
        c.set('actorId', result.principal.id);
        c.set('authMethod', 'session' as AuthMethod);
        await next();
        return;
      }
    }

    // 2. Try Bearer token
    const authHeader = c.req.header('Authorization');
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return c.json(
          { error: { code: 'unauthorized', message: 'Invalid Authorization header format' } },
          401,
        );
      }
      const token = parts[1];

      // 2a. Try as API key
      const apiKeyResult = await authService.validateApiKey(token);
      if (apiKeyResult) {
        c.set('actorId', apiKeyResult.principal.id);
        c.set('authMethod', 'api_key' as AuthMethod);
        await next();
        return;
      }

      // 2b. Try as agent token
      const isAgentToken = await authService.validateAgentToken(workspaceId, token);
      if (isAgentToken) {
        c.set('authMethod', 'agent_token' as AuthMethod);
        await next();
        return;
      }
    }

    // 3. No valid auth
    return c.json(
      { error: { code: 'unauthorized', message: 'Authentication required' } },
      401,
    );
  };
}
