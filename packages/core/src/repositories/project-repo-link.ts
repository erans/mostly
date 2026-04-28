import type { ProjectRepoLink } from '@mostly/types';

export interface ProjectRepoLinkCreateData {
  id: string;
  workspace_id: string;
  project_id: string;
  normalized_url: string;
  subpath: string;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectRepoLinkRepository {
  create(data: ProjectRepoLinkCreateData): Promise<ProjectRepoLink>;
  findById(id: string): Promise<ProjectRepoLink | null>;
  findByUrlAndSubpath(workspaceId: string, normalizedUrl: string, subpath: string): Promise<ProjectRepoLink | null>;
  findByUrls(workspaceId: string, normalizedUrls: string[]): Promise<ProjectRepoLink[]>;
  listForProject(projectId: string): Promise<ProjectRepoLink[]>;
  listForWorkspace(workspaceId: string): Promise<ProjectRepoLink[]>;
  delete(id: string): Promise<void>;
}
