import { Hono } from 'hono';
import {
  CreateTaskRequest,
  PatchTaskRequest,
  TransitionTaskRequest,
  AcquireClaimRequest,
  RenewClaimRequest,
  ReleaseClaimRequest,
  CreateTaskUpdateRequest,
  TaskListParams,
  ListParams,
  NotFoundError,
  InvalidArgumentError,
} from '@mostly/types';
import type { Task } from '@mostly/types';
import type { TaskService } from '@mostly/core';
import type { AppEnv } from '../app.js';

async function resolveTask(
  taskService: TaskService,
  workspaceId: string,
  id: string,
): Promise<Task> {
  try {
    const t = await taskService.get(id);
    if (t.workspace_id !== workspaceId) throw new NotFoundError('task', id);
    return t;
  } catch (err) {
    if (err instanceof NotFoundError) {
      return await taskService.getByKey(workspaceId, id);
    }
    throw err;
  }
}

export function taskRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // GET /v0/tasks - list tasks with filters
  routes.get('/', async (c) => {
    const query = c.req.query();
    const params = TaskListParams.parse(query);

    const taskService = c.get('taskService');
    const workspaceId = c.get('workspaceId');

    const { status, assignee_id, project_id, claimed_by_id, cursor, limit } = params;
    const result = await taskService.list(
      workspaceId,
      { status, assignee_id, project_id, claimed_by_id },
      cursor,
      limit,
    );
    return c.json({ data: result });
  });

  // POST /v0/tasks - create task
  routes.post('/', async (c) => {
    const body = c.get('parsedBody');
    const parsed = CreateTaskRequest.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        details[path] = issue.message;
      }
      throw new InvalidArgumentError('Invalid request body', details);
    }

    const { project_id, type, title, description, assignee_id } = parsed.data;

    const taskService = c.get('taskService');
    const workspaceId = c.get('workspaceId');
    const actorId = c.get('actorId');

    const task = await taskService.create(
      workspaceId,
      { project_id, type, title, description, assignee_id },
      actorId,
    );
    return c.json({ data: task });
  });

  // GET /v0/tasks/:id - get task by ULID or key
  routes.get('/:id', async (c) => {
    const id = c.req.param('id');
    const taskService = c.get('taskService');
    const workspaceId = c.get('workspaceId');

    const task = await resolveTask(taskService, workspaceId, id);
    return c.json({ data: task });
  });

  // PATCH /v0/tasks/:id - update task fields
  routes.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const body = c.get('parsedBody');
    const parsed = PatchTaskRequest.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        details[path] = issue.message;
      }
      throw new InvalidArgumentError('Invalid request body', details);
    }

    const { project_id, type, title, description, assignee_id, expected_version } = parsed.data;

    const taskService = c.get('taskService');
    const workspaceId = c.get('workspaceId');
    const actorId = c.get('actorId');

    const existing = await resolveTask(taskService, workspaceId, id);
    const task = await taskService.update(
      existing.id,
      { project_id, type, title, description, assignee_id },
      expected_version,
      actorId,
    );
    return c.json({ data: task });
  });

  // POST /v0/tasks/:id/transition - status transition
  routes.post('/:id/transition', async (c) => {
    const id = c.req.param('id');
    const body = c.get('parsedBody');
    const parsed = TransitionTaskRequest.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        details[path] = issue.message;
      }
      throw new InvalidArgumentError('Invalid request body', details);
    }

    const { to_status, resolution, expected_version } = parsed.data;

    const taskService = c.get('taskService');
    const workspaceId = c.get('workspaceId');
    const actorId = c.get('actorId');

    const existing = await resolveTask(taskService, workspaceId, id);
    const task = await taskService.transition(
      existing.id,
      to_status,
      resolution ?? null,
      expected_version,
      actorId,
    );
    return c.json({ data: task });
  });

  // POST /v0/tasks/:id/claim - acquire claim
  routes.post('/:id/claim', async (c) => {
    const id = c.req.param('id');
    const body = c.get('parsedBody');
    const parsed = AcquireClaimRequest.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        details[path] = issue.message;
      }
      throw new InvalidArgumentError('Invalid request body', details);
    }

    const { claim_expires_at, expected_version } = parsed.data;

    const taskService = c.get('taskService');
    const workspaceId = c.get('workspaceId');
    const actorId = c.get('actorId');

    const existing = await resolveTask(taskService, workspaceId, id);
    const task = await taskService.acquireClaim(
      existing.id,
      actorId,
      claim_expires_at ?? null,
      expected_version,
    );
    return c.json({ data: task });
  });

  // POST /v0/tasks/:id/renew-claim - renew claim
  routes.post('/:id/renew-claim', async (c) => {
    const id = c.req.param('id');
    const body = c.get('parsedBody');
    const parsed = RenewClaimRequest.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        details[path] = issue.message;
      }
      throw new InvalidArgumentError('Invalid request body', details);
    }

    const { claim_expires_at, expected_version } = parsed.data;

    const taskService = c.get('taskService');
    const workspaceId = c.get('workspaceId');
    const actorId = c.get('actorId');

    const existing = await resolveTask(taskService, workspaceId, id);
    const task = await taskService.renewClaim(
      existing.id,
      actorId,
      claim_expires_at ?? null,
      expected_version,
    );
    return c.json({ data: task });
  });

  // POST /v0/tasks/:id/release-claim - release claim
  routes.post('/:id/release-claim', async (c) => {
    const id = c.req.param('id');
    const body = c.get('parsedBody');
    const parsed = ReleaseClaimRequest.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        details[path] = issue.message;
      }
      throw new InvalidArgumentError('Invalid request body', details);
    }

    const { expected_version } = parsed.data;

    const taskService = c.get('taskService');
    const workspaceId = c.get('workspaceId');
    const actorId = c.get('actorId');

    const existing = await resolveTask(taskService, workspaceId, id);
    const task = await taskService.releaseClaim(
      existing.id,
      actorId,
      expected_version,
    );
    return c.json({ data: task });
  });

  // GET /v0/tasks/:id/updates - list task updates
  routes.get('/:id/updates', async (c) => {
    const id = c.req.param('id');
    const query = c.req.query();
    const params = ListParams.parse(query);

    const taskService = c.get('taskService');
    const workspaceId = c.get('workspaceId');

    // Ensure the task exists (and resolve key if needed)
    const existing = await resolveTask(taskService, workspaceId, id);
    const result = await taskService.listUpdates(existing.id, params.cursor, params.limit);
    return c.json({ data: result });
  });

  // POST /v0/tasks/:id/updates - add task update
  routes.post('/:id/updates', async (c) => {
    const id = c.req.param('id');
    const body = c.get('parsedBody');
    const parsed = CreateTaskUpdateRequest.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        details[path] = issue.message;
      }
      throw new InvalidArgumentError('Invalid request body', details);
    }

    const { kind, body: updateBody, metadata_json } = parsed.data;

    const taskService = c.get('taskService');
    const workspaceId = c.get('workspaceId');
    const actorId = c.get('actorId');

    const existing = await resolveTask(taskService, workspaceId, id);
    const update = await taskService.addUpdate(
      existing.id,
      { kind, body: updateBody, metadata_json },
      actorId,
    );
    return c.json({ data: update });
  });

  return routes;
}
