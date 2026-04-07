import { eq } from 'drizzle-orm';
import type { MostlyDb } from '../types.js';
import type { WorkspaceRepository, WorkspaceCreateData, WorkspacePatchData } from '@mostly/core';
import type { Workspace } from '@mostly/types';
import { NotFoundError } from '@mostly/types';
import { workspaces } from '../schema/index.js';

type DbRow = typeof workspaces.$inferSelect;

function toEntity(row: DbRow): Workspace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    allow_registration: row.allow_registration,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class DrizzleWorkspaceRepository implements WorkspaceRepository {
  constructor(private db: MostlyDb) {}

  async findById(id: string): Promise<Workspace | null> {
    const rows = await this.db.select().from(workspaces).where(eq(workspaces.id, id)).all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findBySlug(slug: string): Promise<Workspace | null> {
    const rows = await this.db.select().from(workspaces).where(eq(workspaces.slug, slug)).all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async getDefault(): Promise<Workspace> {
    const rows = await this.db.select().from(workspaces).where(eq(workspaces.slug, 'default')).limit(1).all();
    if (!rows[0]) throw new NotFoundError('workspace', 'default');
    return toEntity(rows[0]);
  }

  async create(data: WorkspaceCreateData): Promise<Workspace> {
    await this.db.insert(workspaces).values({
      id: data.id,
      slug: data.slug,
      name: data.name,
      agent_token_hash: data.agent_token_hash ?? null,
      allow_registration: data.allow_registration ?? false,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }).run();

    return {
      id: data.id,
      slug: data.slug,
      name: data.name,
      allow_registration: data.allow_registration ?? false,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async update(id: string, data: WorkspacePatchData): Promise<Workspace> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('workspace', id);

    const updateValues: Record<string, unknown> = { updated_at: data.updated_at };
    if (data.name !== undefined) updateValues.name = data.name;
    if (data.agent_token_hash !== undefined) updateValues.agent_token_hash = data.agent_token_hash;
    if (data.allow_registration !== undefined) updateValues.allow_registration = data.allow_registration;

    await this.db.update(workspaces).set(updateValues).where(eq(workspaces.id, id)).run();
    const updated = await this.findById(id);
    return updated!;
  }

  async getAgentTokenHash(id: string): Promise<string | null> {
    const rows = await this.db.select({ agent_token_hash: workspaces.agent_token_hash })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .all();
    return rows[0]?.agent_token_hash ?? null;
  }
}
