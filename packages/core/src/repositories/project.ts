import type { Project } from '@mostly/types';
import type { PaginatedResult } from './types.js';

export interface ProjectCreateData {
  id: string;
  workspace_id: string;
  key: string;
  name: string;
  description: string | null;
  is_archived: boolean;
  created_by_id: string;
  updated_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectPatchData {
  name?: string;
  description?: string | null;
  is_archived?: boolean;
  updated_by_id: string;
  updated_at: string;
}

export interface ProjectRepository {
  findById(id: string): Promise<Project | null>;
  findByKey(workspaceId: string, key: string): Promise<Project | null>;
  list(workspaceId: string, cursor?: string, limit?: number): Promise<PaginatedResult<Project>>;
  create(data: ProjectCreateData): Promise<Project>;
  update(id: string, data: ProjectPatchData): Promise<Project>;
}
