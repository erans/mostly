import { eq, and, gt, or, sql } from 'drizzle-orm';
import type { MostlyDb } from '../types.js';
import type {
  TaskUpdateRepository,
  TaskUpdateCreateData,
  AgentActionContextCreateData,
  PaginatedResult,
} from '@mostly/core';
import type { TaskUpdate } from '@mostly/types';
import { taskUpdates, agentActionContexts } from '../schema/index.js';

type DbRow = typeof taskUpdates.$inferSelect;

function toEntity(row: DbRow): TaskUpdate {
  return {
    id: row.id,
    task_id: row.task_id,
    kind: row.kind as TaskUpdate['kind'],
    body: row.body,
    metadata_json: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    created_by_id: row.created_by_id,
    created_at: row.created_at,
  };
}

export class DrizzleTaskUpdateRepository implements TaskUpdateRepository {
  constructor(private db: MostlyDb) {}

  async list(taskId: string, cursor?: string, limit: number = 50): Promise<PaginatedResult<TaskUpdate>> {
    const conditions = [eq(taskUpdates.task_id, taskId)];
    if (cursor) {
      // Cursor is "created_at|id" for stable pagination
      const sepIdx = cursor.lastIndexOf('|');
      const cursorTime = cursor.slice(0, sepIdx);
      const cursorId = cursor.slice(sepIdx + 1);
      conditions.push(
        or(
          gt(taskUpdates.created_at, cursorTime),
          and(eq(taskUpdates.created_at, cursorTime), gt(taskUpdates.id, cursorId)),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(taskUpdates)
      .where(and(...conditions))
      .orderBy(taskUpdates.created_at, taskUpdates.id)
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toEntity);
    const lastItem = items[items.length - 1];
    return {
      items,
      next_cursor: hasMore && lastItem ? `${lastItem.created_at}|${lastItem.id}` : null,
    };
  }

  async create(data: TaskUpdateCreateData): Promise<TaskUpdate> {
    await this.db.insert(taskUpdates).values({
      id: data.id,
      task_id: data.task_id,
      kind: data.kind,
      body: data.body,
      metadata_json: data.metadata_json ? JSON.stringify(data.metadata_json) : null,
      created_by_id: data.created_by_id,
      created_at: data.created_at,
    }).run();

    return {
      id: data.id,
      task_id: data.task_id,
      kind: data.kind as TaskUpdate['kind'],
      body: data.body,
      metadata_json: data.metadata_json ?? null,
      created_by_id: data.created_by_id,
      created_at: data.created_at,
    };
  }

  async createWithAgentContext(
    data: TaskUpdateCreateData,
    contexts: AgentActionContextCreateData[],
  ): Promise<TaskUpdate> {
    await this.db.insert(taskUpdates).values({
      id: data.id,
      task_id: data.task_id,
      kind: data.kind,
      body: data.body,
      metadata_json: data.metadata_json ? JSON.stringify(data.metadata_json) : null,
      created_by_id: data.created_by_id,
      created_at: data.created_at,
    }).run();

    for (const ctx of contexts) {
      await this.db.insert(agentActionContexts).values({
        id: ctx.id,
        task_update_id: ctx.task_update_id,
        principal_id: ctx.principal_id,
        session_id: ctx.session_id,
        run_id: ctx.run_id,
        tool_name: ctx.tool_name,
        tool_call_id: ctx.tool_call_id,
        source_kind: ctx.source_kind,
        source_ref: ctx.source_ref,
        metadata_json: ctx.metadata_json ? JSON.stringify(ctx.metadata_json) : null,
        created_at: ctx.created_at,
      }).run();
    }

    return {
      id: data.id,
      task_id: data.task_id,
      kind: data.kind as TaskUpdate['kind'],
      body: data.body,
      metadata_json: data.metadata_json ?? null,
      created_by_id: data.created_by_id,
      created_at: data.created_at,
    };
  }
}
