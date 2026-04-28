import { Hono } from 'hono';
import { CreateRepoLinkRequest, NotFoundError, InvalidArgumentError } from '@mostly/types';
import type { AppEnv } from '../app.js';
import type { ProjectService } from '@mostly/core';
import type { Project } from '@mostly/types';

async function resolveProject(projectService: ProjectService, ws: string, idOrKey: string): Promise<Project> {
  try {
    const p = await projectService.get(idOrKey);
    if (p.workspace_id !== ws) throw new NotFoundError('project', idOrKey);
    return p;
  } catch (err) {
    if (err instanceof NotFoundError) return await projectService.getByKey(ws, idOrKey);
    throw err;
  }
}

export function repoLinkRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // GET /v0/repo-links — workspace-wide listing
  routes.get('/repo-links', async (c) => {
    const svc = c.get('repoLinkService');
    const ws = c.get('workspaceId');
    const data = await svc.listForWorkspace(ws);
    return c.json({ data });
  });

  // GET /v0/projects/:id/repo-links
  routes.get('/projects/:id/repo-links', async (c) => {
    const id = c.req.param('id');
    const projectService = c.get('projectService');
    const ws = c.get('workspaceId');
    const project = await resolveProject(projectService, ws, id);
    const svc = c.get('repoLinkService');
    const data = await svc.listForProject(project.id);
    return c.json({ data });
  });

  // POST /v0/projects/:id/repo-links
  routes.post('/projects/:id/repo-links', async (c) => {
    const body = c.get('parsedBody');
    const parsed = CreateRepoLinkRequest.safeParse(body);
    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) details[issue.path.join('.')] = issue.message;
      throw new InvalidArgumentError('Invalid request body', details);
    }
    const ws = c.get('workspaceId');
    const actorId = c.get('actorId');
    const projectService = c.get('projectService');
    const project = await resolveProject(projectService, ws, c.req.param('id'));
    const svc = c.get('repoLinkService');
    const link = await svc.link(ws, project.id, parsed.data, actorId);
    return c.json({ data: link });
  });

  // DELETE /v0/projects/:id/repo-links/:linkId
  routes.delete('/projects/:id/repo-links/:linkId', async (c) => {
    const ws = c.get('workspaceId');
    const svc = c.get('repoLinkService');
    await svc.unlink(ws, c.req.param('linkId'));
    return c.body(null, 204);
  });

  return routes;
}
