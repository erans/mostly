import type { Workspace } from '@mostly/types';

export interface WorkspaceCreateData {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findBySlug(slug: string): Promise<Workspace | null>;
  getDefault(): Promise<Workspace>;
  create(data: WorkspaceCreateData): Promise<Workspace>;
}
