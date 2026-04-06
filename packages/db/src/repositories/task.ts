import { eq, and, gt, lte, isNotNull, sql } from 'drizzle-orm';
import type { MostlyDb } from '../types.js';
import type { TaskRepository, TaskCreateData, TaskUpdateData, TaskListFilters, PaginatedResult } from '@mostly/core';
import type { Task } from '@mostly/types';
import { NotFoundError, ConflictError } from '@mostly/types';
import { tasks, taskKeySequences } from '../schema/index.js';

type DbRow = typeof tasks.$inferSelect;

function toEntity(row: DbRow): Task {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    project_id: row.project_id,
    key: row.key,
    type: row.type as Task['type'],
    title: row.title,
    description: row.description,
    status: row.status as Task['status'],
    resolution: row.resolution as Task['resolution'],
    assignee_id: row.assignee_id,
    claimed_by_id: row.claimed_by_id,
    claim_expires_at: row.claim_expires_at,
    version: row.version,
    created_by_id: row.created_by_id,
    updated_by_id: row.updated_by_id,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class DrizzleTaskRepository implements TaskRepository {
  constructor(private db: MostlyDb) {}

  async findById(id: string): Promise<Task | null> {
    const rows = await this.db.select().from(tasks).where(eq(tasks.id, id)).all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findByKey(workspaceId: string, key: string): Promise<Task | null> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspace_id, workspaceId), eq(tasks.key, key)))
      .all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async list(
    workspaceId: string,
    filters: TaskListFilters,
    cursor?: string,
    limit: number = 50,
  ): Promise<PaginatedResult<Task>> {
    const conditions = [eq(tasks.workspace_id, workspaceId)];

    if (filters.status) conditions.push(eq(tasks.status, filters.status));
    if (filters.assignee_id) conditions.push(eq(tasks.assignee_id, filters.assignee_id));
    if (filters.project_id) conditions.push(eq(tasks.project_id, filters.project_id));
    if (filters.claimed_by_id) conditions.push(eq(tasks.claimed_by_id, filters.claimed_by_id));

    if (cursor) conditions.push(gt(tasks.id, cursor));

    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(tasks.id)
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toEntity);
    return {
      items,
      next_cursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async create(data: TaskCreateData): Promise<Task> {
    await this.db.insert(tasks).values({
      id: data.id,
      workspace_id: data.workspace_id,
      project_id: data.project_id,
      key: data.key,
      type: data.type,
      title: data.title,
      description: data.description,
      status: data.status,
      resolution: data.resolution,
      assignee_id: data.assignee_id,
      claimed_by_id: data.claimed_by_id,
      claim_expires_at: data.claim_expires_at,
      version: data.version,
      created_by_id: data.created_by_id,
      updated_by_id: data.updated_by_id,
      resolved_at: data.resolved_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }).run();

    return toEntity({
      id: data.id,
      workspace_id: data.workspace_id,
      project_id: data.project_id,
      key: data.key,
      type: data.type,
      title: data.title,
      description: data.description,
      status: data.status,
      resolution: data.resolution,
      assignee_id: data.assignee_id,
      claimed_by_id: data.claimed_by_id,
      claim_expires_at: data.claim_expires_at,
      version: data.version,
      created_by_id: data.created_by_id,
      updated_by_id: data.updated_by_id,
      resolved_at: data.resolved_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    });
  }

  async update(id: string, data: TaskUpdateData, expectedVersion: number): Promise<Task> {
    const updateValues: Record<string, unknown> = {
      version: data.version,
      updated_by_id: data.updated_by_id,
      updated_at: data.updated_at,
    };

    if (data.project_id !== undefined) updateValues.project_id = data.project_id;
    if (data.type !== undefined) updateValues.type = data.type;
    if (data.title !== undefined) updateValues.title = data.title;
    if (data.description !== undefined) updateValues.description = data.description;
    if (data.status !== undefined) updateValues.status = data.status;
    if (data.resolution !== undefined) updateValues.resolution = data.resolution;
    if (data.assignee_id !== undefined) updateValues.assignee_id = data.assignee_id;
    if (data.claimed_by_id !== undefined) updateValues.claimed_by_id = data.claimed_by_id;
    if (data.claim_expires_at !== undefined) updateValues.claim_expires_at = data.claim_expires_at;
    if (data.resolved_at !== undefined) updateValues.resolved_at = data.resolved_at;

    const result = await this.db
      .update(tasks)
      .set(updateValues)
      .where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion)))
      .run();

    if (result.changes === 0) {
      // Distinguish between not found and version conflict
      const existing = await this.findById(id);
      if (!existing) throw new NotFoundError('task', id);
      throw new ConflictError(`task ${id}: expected version ${expectedVersion}, actual ${existing.version}`);
    }

    const updated = await this.findById(id);
    return updated!;
  }

  async nextKeyNumber(workspaceId: string, prefix: string): Promise<number> {
    // Single atomic statement: upsert and return the allocated number.
    // SQLite 3.35+ supports RETURNING on INSERT ... ON CONFLICT.
    const rows = await this.db.all<{ next_number: number }>(sql`
      INSERT INTO task_key_sequence (workspace_id, prefix, next_number)
      VALUES (${workspaceId}, ${prefix}, 2)
      ON CONFLICT (workspace_id, prefix)
      DO UPDATE SET next_number = next_number + 1
      RETURNING next_number - 1 AS next_number
    `);

    return rows[0].next_number;
  }

  async findWithExpiredClaims(workspaceId: string): Promise<Task[]> {
    const now = new Date().toISOString();
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.workspace_id, workspaceId),
          isNotNull(tasks.claimed_by_id),
          lte(tasks.claim_expires_at, now),
        ),
      )
      .all();

    return rows.map(toEntity);
  }
}
