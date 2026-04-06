import { generateId, ID_PREFIXES, NotFoundError, PreconditionFailedError } from '@mostly/types';
import type { Task, TaskUpdate } from '@mostly/types';
import type {
  TaskRepository, TaskUpdateRepository, ProjectRepository,
  TransactionManager, PaginatedResult, TaskListFilters,
  TaskUpdateCreateData,
} from '../repositories/index.js';
import { formatTaskKey, DEFAULT_PREFIX } from '../keys.js';
import { validateTransition, isTerminal } from '../state-machine.js';
import {
  isClaimActive, isClaimExpired, canAcquireClaim,
  canRenewClaim, canReleaseClaim,
  statusAfterClaimAcquire, statusAfterClaimRelease,
} from '../claims.js';

export interface CreateTaskInput {
  project_id?: string | null;
  type: string;
  title: string;
  description?: string | null;
  assignee_id?: string | null;
}

export interface PatchTaskInput {
  project_id?: string | null;
  type?: string;
  title?: string;
  description?: string | null;
  assignee_id?: string | null;
}

export class TaskService {
  constructor(
    private tasks: TaskRepository,
    private taskUpdates: TaskUpdateRepository,
    private projects: ProjectRepository,
    private tx: TransactionManager,
  ) {}

  async create(workspaceId: string, input: CreateTaskInput, actorId: string): Promise<Task> {
    return this.tx.withTransaction(async (ctx) => {
      let prefix = DEFAULT_PREFIX;
      const projectId = input.project_id ?? null;

      if (projectId) {
        const project = await ctx.projects.findById(projectId);
        if (!project) throw new NotFoundError('project', projectId);
        prefix = project.key;
      }

      const number = await ctx.tasks.nextKeyNumber(workspaceId, prefix);
      const key = formatTaskKey(prefix, number);
      const now = new Date().toISOString();

      return ctx.tasks.create({
        id: generateId(ID_PREFIXES.task),
        workspace_id: workspaceId,
        project_id: projectId,
        key,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        status: 'open',
        resolution: null,
        assignee_id: input.assignee_id ?? null,
        claimed_by_id: null,
        claim_expires_at: null,
        version: 1,
        created_by_id: actorId,
        updated_by_id: actorId,
        resolved_at: null,
        created_at: now,
        updated_at: now,
      });
    });
  }

  async get(id: string): Promise<Task> {
    const task = await this.tasks.findById(id);
    if (!task) throw new NotFoundError('task', id);
    return task;
  }

  async getByKey(workspaceId: string, key: string): Promise<Task> {
    const task = await this.tasks.findByKey(workspaceId, key);
    if (!task) throw new NotFoundError('task', key);
    return task;
  }

  async list(workspaceId: string, filters: TaskListFilters, cursor?: string, limit?: number): Promise<PaginatedResult<Task>> {
    return this.tasks.list(workspaceId, filters, cursor, limit);
  }

  async update(id: string, input: PatchTaskInput, expectedVersion: number, actorId: string): Promise<Task> {
    const task = await this.tasks.findById(id);
    if (!task) throw new NotFoundError('task', id);
    if (isTerminal(task.status)) {
      throw new PreconditionFailedError('cannot update a task in terminal state');
    }

    const now = new Date().toISOString();
    const updated = await this.tasks.update(id, {
      ...input,
      version: task.version + 1,
      updated_by_id: actorId,
      updated_at: now,
    }, expectedVersion);

    if (input.assignee_id !== undefined && input.assignee_id !== task.assignee_id) {
      await this.emitSystemUpdate(task.id, actorId,
        `Assignee changed from ${task.assignee_id ?? 'none'} to ${input.assignee_id ?? 'none'}`);
    }

    return updated;
  }

  async transition(
    id: string,
    toStatus: string,
    resolution: string | null,
    expectedVersion: number,
    actorId: string,
  ): Promise<Task> {
    const task = await this.tasks.findById(id);
    if (!task) throw new NotFoundError('task', id);

    // Lazy expiry check
    const taskForValidation = this.withLazyExpiryCheck(task);

    const result = validateTransition(taskForValidation, toStatus, resolution, actorId);
    if (!result.valid) {
      throw new PreconditionFailedError(result.error);
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      status: toStatus,
      version: task.version + 1,
      updated_by_id: actorId,
      updated_at: now,
    };

    for (const effect of result.sideEffects) {
      if (effect.type === 'release_claim' || effect.type === 'clear_expired_claim') {
        updateData.claimed_by_id = null;
        updateData.claim_expires_at = null;
      }
      if (effect.type === 'set_resolved_at') {
        updateData.resolved_at = now;
        updateData.resolution = resolution;
      }
    }

    const updated = await this.tasks.update(id, updateData as any, expectedVersion);

    await this.emitSystemUpdate(task.id, actorId,
      `Status transitioned from ${task.status} to ${toStatus}${resolution ? ` (${resolution})` : ''}`);

    return updated;
  }

  async acquireClaim(
    id: string,
    actorId: string,
    expiresAt: string | null,
    expectedVersion: number,
  ): Promise<Task> {
    const task = await this.tasks.findById(id);
    if (!task) throw new NotFoundError('task', id);

    // Lazy expiry cleanup
    const effectiveTask = this.withLazyExpiryCheck(task);

    if (!canAcquireClaim(effectiveTask)) {
      throw new PreconditionFailedError('cannot acquire claim on this task');
    }

    const now = new Date().toISOString();
    const newStatus = statusAfterClaimAcquire(effectiveTask.status);

    const updated = await this.tasks.update(id, {
      claimed_by_id: actorId,
      claim_expires_at: expiresAt,
      status: newStatus,
      version: task.version + 1,
      updated_by_id: actorId,
      updated_at: now,
    }, expectedVersion);

    await this.emitClaimUpdate(task.id, actorId, 'Claim acquired');

    return updated;
  }

  async renewClaim(
    id: string,
    actorId: string,
    expiresAt: string | null,
    expectedVersion: number,
  ): Promise<Task> {
    const task = await this.tasks.findById(id);
    if (!task) throw new NotFoundError('task', id);

    if (!canRenewClaim(task, actorId)) {
      throw new PreconditionFailedError('cannot renew claim: not the current claimer');
    }

    const now = new Date().toISOString();
    const updated = await this.tasks.update(id, {
      claim_expires_at: expiresAt,
      version: task.version + 1,
      updated_by_id: actorId,
      updated_at: now,
    }, expectedVersion);

    await this.emitClaimUpdate(task.id, actorId, 'Claim renewed');

    return updated;
  }

  async releaseClaim(
    id: string,
    actorId: string,
    expectedVersion: number,
  ): Promise<Task> {
    const task = await this.tasks.findById(id);
    if (!task) throw new NotFoundError('task', id);

    if (!canReleaseClaim(task, actorId)) {
      throw new PreconditionFailedError('cannot release claim: not the current claimer');
    }

    const now = new Date().toISOString();
    const newStatus = statusAfterClaimRelease(task.status);

    const updated = await this.tasks.update(id, {
      claimed_by_id: null,
      claim_expires_at: null,
      status: newStatus,
      version: task.version + 1,
      updated_by_id: actorId,
      updated_at: now,
    }, expectedVersion);

    await this.emitClaimUpdate(task.id, actorId, 'Claim released');

    return updated;
  }

  async addUpdate(
    taskId: string,
    input: { kind: string; body: string; metadata_json?: Record<string, unknown> | null },
    actorId: string,
  ): Promise<TaskUpdate> {
    const task = await this.tasks.findById(taskId);
    if (!task) throw new NotFoundError('task', taskId);

    return this.taskUpdates.create({
      id: generateId(ID_PREFIXES.taskUpdate),
      task_id: taskId,
      kind: input.kind,
      body: input.body,
      metadata_json: input.metadata_json ?? null,
      created_by_id: actorId,
      created_at: new Date().toISOString(),
    });
  }

  async listUpdates(taskId: string, cursor?: string, limit?: number): Promise<PaginatedResult<TaskUpdate>> {
    return this.taskUpdates.list(taskId, cursor, limit);
  }

  private withLazyExpiryCheck(task: Task): Task {
    if (isClaimExpired(task)) {
      return {
        ...task,
        claimed_by_id: null,
        claim_expires_at: null,
      };
    }
    return task;
  }

  private async emitSystemUpdate(taskId: string, actorId: string, body: string): Promise<void> {
    await this.taskUpdates.create({
      id: generateId(ID_PREFIXES.taskUpdate),
      task_id: taskId,
      kind: 'system',
      body,
      metadata_json: null,
      created_by_id: actorId,
      created_at: new Date().toISOString(),
    });
  }

  private async emitClaimUpdate(taskId: string, actorId: string, body: string): Promise<void> {
    await this.taskUpdates.create({
      id: generateId(ID_PREFIXES.taskUpdate),
      task_id: taskId,
      kind: 'claim',
      body,
      metadata_json: null,
      created_by_id: actorId,
      created_at: new Date().toISOString(),
    });
  }
}
