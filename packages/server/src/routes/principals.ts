import { Hono } from 'hono';
import { CreatePrincipalRequest, PatchPrincipalRequest, ListParams, NotFoundError } from '@mostly/types';
import { InvalidArgumentError } from '@mostly/types';
import type { PrincipalService } from '@mostly/core';
import type { Principal } from '@mostly/types';
import type { AppEnv } from '../app.js';

async function resolvePrincipal(
  principalService: PrincipalService,
  workspaceId: string,
  id: string,
): Promise<Principal> {
  try {
    const p = await principalService.get(id);
    if (p.workspace_id !== workspaceId) throw new NotFoundError('principal', id);
    return p;
  } catch (err) {
    if (err instanceof NotFoundError) {
      return await principalService.getByHandle(workspaceId, id);
    }
    throw err;
  }
}

export function principalRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // GET /v0/principals - list principals (supports ?email= filter)
  routes.get('/', async (c) => {
    const query = c.req.query();
    const principalService = c.get('principalService');
    const workspaceId = c.get('workspaceId');

    // When ?email= is present, return a flat array of matching principals
    // (no cursor pagination — callers use this for point-lookups).
    if (query.email) {
      const matches = await principalService.findByEmail(workspaceId, query.email);
      return c.json({ data: matches });
    }

    const params = ListParams.parse(query);
    const result = await principalService.list(workspaceId, params.cursor, params.limit);
    return c.json({ data: result });
  });

  // POST /v0/principals - create principal
  routes.post('/', async (c) => {
    const body = c.get('parsedBody');
    const parsed = CreatePrincipalRequest.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        details[path] = issue.message;
      }
      throw new InvalidArgumentError('Invalid request body', details);
    }

    const { handle, kind, display_name, metadata_json } = parsed.data;

    const principalService = c.get('principalService');
    const workspaceId = c.get('workspaceId');

    const principal = await principalService.create(workspaceId, {
      handle,
      kind,
      display_name,
      metadata_json,
    });

    return c.json({ data: principal });
  });

  // GET /v0/principals/:id - get principal by ULID or handle
  routes.get('/:id', async (c) => {
    const id = c.req.param('id');
    const principalService = c.get('principalService');
    const workspaceId = c.get('workspaceId');

    const principal = await resolvePrincipal(principalService, workspaceId, id);
    return c.json({ data: principal });
  });

  // PATCH /v0/principals/:id - update principal
  routes.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const body = c.get('parsedBody');
    const parsed = PatchPrincipalRequest.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        details[path] = issue.message;
      }
      throw new InvalidArgumentError('Invalid request body', details);
    }

    const { display_name, kind, metadata_json, is_active } = parsed.data;

    const principalService = c.get('principalService');
    const workspaceId = c.get('workspaceId');

    const existing = await resolvePrincipal(principalService, workspaceId, id);
    const principal = await principalService.update(existing.id, {
      display_name,
      kind,
      metadata_json,
      is_active,
    });

    return c.json({ data: principal });
  });

  return routes;
}
