import { Hono } from 'hono';
import { CreateProjectRequest, PatchProjectRequest, ListParams, NotFoundError } from '@mostly/types';
import { InvalidArgumentError } from '@mostly/types';
import type { ProjectService } from '@mostly/core';
import type { Project } from '@mostly/types';
import type { AppEnv } from '../app.js';

async function resolveProject(
  projectService: ProjectService,
  workspaceId: string,
  id: string,
): Promise<Project> {
  try {
    return await projectService.get(id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return await projectService.getByKey(workspaceId, id);
    }
    throw err;
  }
}

export function projectRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // GET /v0/projects - list projects
  routes.get('/', async (c) => {
    const query = c.req.query();
    const params = ListParams.parse(query);

    const projectService = c.get('projectService');
    const workspaceId = c.get('workspaceId');

    const result = await projectService.list(workspaceId, params.cursor, params.limit);
    return c.json({ data: result });
  });

  // POST /v0/projects - create project
  routes.post('/', async (c) => {
    const body = c.get('parsedBody');
    const parsed = CreateProjectRequest.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        details[path] = issue.message;
      }
      throw new InvalidArgumentError('Invalid request body', details);
    }

    const { key, name, description } = parsed.data;

    const projectService = c.get('projectService');
    const workspaceId = c.get('workspaceId');
    const actorId = c.get('actorId');

    const project = await projectService.create(workspaceId, { key, name, description }, actorId);
    return c.json({ data: project });
  });

  // GET /v0/projects/:id - get project by ULID or key
  routes.get('/:id', async (c) => {
    const id = c.req.param('id');
    const projectService = c.get('projectService');
    const workspaceId = c.get('workspaceId');

    const project = await resolveProject(projectService, workspaceId, id);
    return c.json({ data: project });
  });

  // PATCH /v0/projects/:id - update project
  routes.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const body = c.get('parsedBody');
    const parsed = PatchProjectRequest.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        details[path] = issue.message;
      }
      throw new InvalidArgumentError('Invalid request body', details);
    }

    const { name, description, is_archived } = parsed.data;

    const projectService = c.get('projectService');
    const workspaceId = c.get('workspaceId');
    const actorId = c.get('actorId');

    const existing = await resolveProject(projectService, workspaceId, id);
    const project = await projectService.update(existing.id, { name, description, is_archived }, actorId);
    return c.json({ data: project });
  });

  return routes;
}
