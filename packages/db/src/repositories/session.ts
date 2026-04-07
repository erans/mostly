import { eq } from 'drizzle-orm';
import type { MostlyDb } from '../types.js';
import type { SessionRepository, SessionCreateData } from '@mostly/core';
import type { Session } from '@mostly/types';
import { sessions } from '../schema/index.js';

type DbRow = typeof sessions.$inferSelect;

function toEntity(row: DbRow): Session {
  return {
    id: row.id,
    principal_id: row.principal_id,
    workspace_id: row.workspace_id,
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private db: MostlyDb) {}

  async findById(id: string): Promise<Session | null> {
    const rows = await this.db.select().from(sessions).where(eq(sessions.id, id)).all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async create(data: SessionCreateData): Promise<Session> {
    await this.db.insert(sessions).values(data).run();
    return {
      id: data.id,
      principal_id: data.principal_id,
      workspace_id: data.workspace_id,
      expires_at: data.expires_at,
      created_at: data.created_at,
    };
  }

  async updateExpiresAt(id: string, expiresAt: string): Promise<void> {
    await this.db.update(sessions).set({ expires_at: expiresAt }).where(eq(sessions.id, id)).run();
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id)).run();
  }

  async deleteByPrincipalId(principalId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.principal_id, principalId)).run();
  }
}
