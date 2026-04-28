import { Hono } from 'hono';
import { GitContextResolveRequest, InvalidArgumentError } from '@mostly/types';
import type { AppEnv } from '../app.js';

export function gitContextRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/resolve', async (c) => {
    const body = c.get('parsedBody');
    const parsed = GitContextResolveRequest.safeParse(body);
    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) details[issue.path.join('.')] = issue.message;
      throw new InvalidArgumentError('Invalid request body', details);
    }
    const ws = c.get('workspaceId');
    const svc = c.get('repoLinkService');
    const data = await svc.resolve(ws, parsed.data);
    return c.json({ data });
  });

  return routes;
}
