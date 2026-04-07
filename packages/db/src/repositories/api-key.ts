import { eq, and } from 'drizzle-orm';
import type { MostlyDb } from '../types.js';
import type { ApiKeyRepository, ApiKeyCreateData } from '@mostly/core';
import type { ApiKey } from '@mostly/types';
import { apiKeys } from '../schema/index.js';

type DbRow = typeof apiKeys.$inferSelect;

function toEntity(row: DbRow): ApiKey {
  return {
    id: row.id,
    principal_id: row.principal_id,
    workspace_id: row.workspace_id,
    name: row.name,
    key_prefix: row.key_prefix,
    is_active: row.is_active,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
  };
}

export class DrizzleApiKeyRepository implements ApiKeyRepository {
  constructor(private db: MostlyDb) {}

  async findByHash(keyHash: string): Promise<(ApiKey & { key_hash: string }) | null> {
    const rows = await this.db.select().from(apiKeys).where(eq(apiKeys.key_hash, keyHash)).all();
    if (!rows[0]) return null;
    return { ...toEntity(rows[0]), key_hash: rows[0].key_hash };
  }

  async findByPrincipalAndName(principalId: string, name: string): Promise<ApiKey | null> {
    const rows = await this.db.select().from(apiKeys)
      .where(and(eq(apiKeys.principal_id, principalId), eq(apiKeys.name, name)))
      .all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async listByPrincipal(principalId: string): Promise<ApiKey[]> {
    const rows = await this.db.select().from(apiKeys)
      .where(eq(apiKeys.principal_id, principalId))
      .orderBy(apiKeys.created_at)
      .all();
    return rows.map(toEntity);
  }

  async create(data: ApiKeyCreateData): Promise<ApiKey> {
    await this.db.insert(apiKeys).values(data).run();
    return {
      id: data.id,
      principal_id: data.principal_id,
      workspace_id: data.workspace_id,
      name: data.name,
      key_prefix: data.key_prefix,
      is_active: data.is_active,
      created_at: data.created_at,
      last_used_at: data.last_used_at,
    };
  }

  async deactivate(id: string): Promise<void> {
    await this.db.update(apiKeys).set({ is_active: false }).where(eq(apiKeys.id, id)).run();
  }

  async updateLastUsed(id: string, lastUsedAt: string): Promise<void> {
    await this.db.update(apiKeys).set({ last_used_at: lastUsedAt }).where(eq(apiKeys.id, id)).run();
  }
}
