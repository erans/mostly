import { eq, and, gt, or } from 'drizzle-orm';
import type { MostlyDb } from '../types.js';
import type { ProjectRepository, ProjectCreateData, ProjectPatchData, PaginatedResult } from '@mostly/core';
import type { Project } from '@mostly/types';
import { NotFoundError, InvalidArgumentError } from '@mostly/types';
import { projects } from '../schema/index.js';

type DbRow = typeof projects.$inferSelect;

function toEntity(row: DbRow): Project {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    key: row.key,
    name: row.name,
    description: row.description,
    is_archived: row.is_archived,
    created_by_id: row.created_by_id,
    updated_by_id: row.updated_by_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private db: MostlyDb) {}

  async findById(id: string): Promise<Project | null> {
    const rows = await this.db.select().from(projects).where(eq(projects.id, id)).all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findByKey(workspaceId: string, key: string): Promise<Project | null> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.workspace_id, workspaceId), eq(projects.key, key)))
      .all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async list(workspaceId: string, cursor?: string, limit: number = 50): Promise<PaginatedResult<Project>> {
    const conditions = [eq(projects.workspace_id, workspaceId)];
    if (cursor) {
      const sepIdx = cursor.lastIndexOf('|');
      if (sepIdx <= 0 || sepIdx === cursor.length - 1) {
        throw new InvalidArgumentError('invalid cursor format');
      }
      const cursorTime = cursor.slice(0, sepIdx);
      const cursorId = cursor.slice(sepIdx + 1);
      conditions.push(
        or(
          gt(projects.created_at, cursorTime),
          and(eq(projects.created_at, cursorTime), gt(projects.id, cursorId)),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(projects.created_at, projects.id)
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

  async create(data: ProjectCreateData): Promise<Project> {
    await this.db.insert(projects).values({
      id: data.id,
      workspace_id: data.workspace_id,
      key: data.key,
      name: data.name,
      description: data.description,
      is_archived: data.is_archived,
      created_by_id: data.created_by_id,
      updated_by_id: data.updated_by_id,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }).run();

    return {
      id: data.id,
      workspace_id: data.workspace_id,
      key: data.key,
      name: data.name,
      description: data.description,
      is_archived: data.is_archived,
      created_by_id: data.created_by_id,
      updated_by_id: data.updated_by_id,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async update(id: string, data: ProjectPatchData): Promise<Project> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('project', id);

    const updateValues: Record<string, unknown> = {
      updated_by_id: data.updated_by_id,
      updated_at: data.updated_at,
    };
    if (data.name !== undefined) updateValues.name = data.name;
    if (data.description !== undefined) updateValues.description = data.description;
    if (data.is_archived !== undefined) updateValues.is_archived = data.is_archived;

    await this.db.update(projects).set(updateValues).where(eq(projects.id, id)).run();

    const updated = await this.findById(id);
    return updated!;
  }
}
