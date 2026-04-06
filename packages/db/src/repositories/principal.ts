import { eq, and, gt, or } from 'drizzle-orm';
import type { MostlyDb } from '../types.js';
import type { PrincipalRepository, PrincipalCreateData, PrincipalPatchData, PaginatedResult } from '@mostly/core';
import type { Principal } from '@mostly/types';
import { NotFoundError, InvalidArgumentError } from '@mostly/types';
import { principals } from '../schema/index.js';

type DbRow = typeof principals.$inferSelect;

function toEntity(row: DbRow): Principal {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    handle: row.handle,
    kind: row.kind as Principal['kind'],
    display_name: row.display_name,
    metadata_json: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class DrizzlePrincipalRepository implements PrincipalRepository {
  constructor(private db: MostlyDb) {}

  async findById(id: string): Promise<Principal | null> {
    const rows = await this.db.select().from(principals).where(eq(principals.id, id)).all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findByHandle(workspaceId: string, handle: string): Promise<Principal | null> {
    const rows = await this.db
      .select()
      .from(principals)
      .where(and(eq(principals.workspace_id, workspaceId), eq(principals.handle, handle)))
      .all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async list(workspaceId: string, cursor?: string, limit: number = 50): Promise<PaginatedResult<Principal>> {
    const conditions = [eq(principals.workspace_id, workspaceId)];
    if (cursor) {
      const sepIdx = cursor.lastIndexOf('|');
      if (sepIdx <= 0 || sepIdx === cursor.length - 1) {
        throw new InvalidArgumentError('invalid cursor format');
      }
      const cursorTime = cursor.slice(0, sepIdx);
      const cursorId = cursor.slice(sepIdx + 1);
      conditions.push(
        or(
          gt(principals.created_at, cursorTime),
          and(eq(principals.created_at, cursorTime), gt(principals.id, cursorId)),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(principals)
      .where(and(...conditions))
      .orderBy(principals.created_at, principals.id)
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

  async create(data: PrincipalCreateData): Promise<Principal> {
    const metadataStr = data.metadata_json ? JSON.stringify(data.metadata_json) : null;

    await this.db.insert(principals).values({
      id: data.id,
      workspace_id: data.workspace_id,
      handle: data.handle,
      kind: data.kind,
      display_name: data.display_name,
      metadata_json: metadataStr,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }).run();

    return {
      id: data.id,
      workspace_id: data.workspace_id,
      handle: data.handle,
      kind: data.kind as Principal['kind'],
      display_name: data.display_name,
      metadata_json: data.metadata_json ?? null,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async update(id: string, data: PrincipalPatchData): Promise<Principal> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('principal', id);

    const updateValues: Record<string, unknown> = { updated_at: data.updated_at };
    if (data.display_name !== undefined) updateValues.display_name = data.display_name;
    if (data.kind !== undefined) updateValues.kind = data.kind;
    if (data.metadata_json !== undefined) {
      updateValues.metadata_json = data.metadata_json ? JSON.stringify(data.metadata_json) : null;
    }
    if (data.is_active !== undefined) updateValues.is_active = data.is_active;

    await this.db.update(principals).set(updateValues).where(eq(principals.id, id)).run();

    const updated = await this.findById(id);
    return updated!;
  }
}
