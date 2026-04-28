import { eq, and, inArray } from 'drizzle-orm';
import type { MostlyDb } from '../types.js';
import type { ProjectRepoLinkRepository, ProjectRepoLinkCreateData } from '@mostly/core';
import type { ProjectRepoLink } from '@mostly/types';
import { projectRepoLinks } from '../schema/index.js';

type DbRow = typeof projectRepoLinks.$inferSelect;

function toEntity(row: DbRow): ProjectRepoLink {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    project_id: row.project_id,
    normalized_url: row.normalized_url,
    subpath: row.subpath,
    created_by_id: row.created_by_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class DrizzleProjectRepoLinkRepository implements ProjectRepoLinkRepository {
  constructor(private db: MostlyDb) {}

  async create(data: ProjectRepoLinkCreateData): Promise<ProjectRepoLink> {
    await this.db.insert(projectRepoLinks).values(data).run();
    const row = (await this.db.select().from(projectRepoLinks).where(eq(projectRepoLinks.id, data.id)).all())[0];
    return toEntity(row);
  }

  async findById(id: string): Promise<ProjectRepoLink | null> {
    const rows = await this.db.select().from(projectRepoLinks).where(eq(projectRepoLinks.id, id)).all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findByUrlAndSubpath(workspaceId: string, normalizedUrl: string, subpath: string): Promise<ProjectRepoLink | null> {
    const rows = await this.db
      .select()
      .from(projectRepoLinks)
      .where(and(
        eq(projectRepoLinks.workspace_id, workspaceId),
        eq(projectRepoLinks.normalized_url, normalizedUrl),
        eq(projectRepoLinks.subpath, subpath),
      ))
      .all();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findByUrls(workspaceId: string, normalizedUrls: string[]): Promise<ProjectRepoLink[]> {
    if (normalizedUrls.length === 0) return [];
    const rows = await this.db
      .select()
      .from(projectRepoLinks)
      .where(and(
        eq(projectRepoLinks.workspace_id, workspaceId),
        inArray(projectRepoLinks.normalized_url, normalizedUrls),
      ))
      .all();
    return rows.map(toEntity);
  }

  async listForProject(projectId: string): Promise<ProjectRepoLink[]> {
    const rows = await this.db
      .select()
      .from(projectRepoLinks)
      .where(eq(projectRepoLinks.project_id, projectId))
      .all();
    return rows.map(toEntity);
  }

  async listForWorkspace(workspaceId: string): Promise<ProjectRepoLink[]> {
    const rows = await this.db
      .select()
      .from(projectRepoLinks)
      .where(eq(projectRepoLinks.workspace_id, workspaceId))
      .all();
    return rows.map(toEntity);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(projectRepoLinks).where(eq(projectRepoLinks.id, id)).run();
  }
}
