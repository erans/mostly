import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { WorkspaceRepository, WorkspaceCreateData } from '@mostly/core';
import type { Workspace } from '@mostly/types';
import { NotFoundError } from '@mostly/types';
import { workspaces } from '../schema/index.js';
import type * as schema from '../schema/index.js';

type DbRow = typeof workspaces.$inferSelect;

function toEntity(row: DbRow): Workspace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class DrizzleWorkspaceRepository implements WorkspaceRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  async findById(id: string): Promise<Workspace | null> {
    const rows = this.db.select().from(workspaces).where(eq(workspaces.id, id)).all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findBySlug(slug: string): Promise<Workspace | null> {
    const rows = this.db.select().from(workspaces).where(eq(workspaces.slug, slug)).all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async getDefault(): Promise<Workspace> {
    const rows = this.db.select().from(workspaces).limit(1).all();
    if (!rows[0]) throw new NotFoundError('workspace', 'default');
    return toEntity(rows[0]);
  }

  async create(data: WorkspaceCreateData): Promise<Workspace> {
    this.db.insert(workspaces).values({
      id: data.id,
      slug: data.slug,
      name: data.name,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }).run();

    return {
      id: data.id,
      slug: data.slug,
      name: data.name,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}
