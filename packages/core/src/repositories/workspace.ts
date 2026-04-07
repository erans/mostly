import type { Workspace } from '@mostly/types';

export interface WorkspaceCreateData {
  id: string;
  slug: string;
  name: string;
  agent_token_hash?: string | null;
  allow_registration?: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkspacePatchData {
  name?: string;
  agent_token_hash?: string | null;
  allow_registration?: boolean;
  updated_at: string;
}

export interface WorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findBySlug(slug: string): Promise<Workspace | null>;
  getDefault(): Promise<Workspace>;
  create(data: WorkspaceCreateData): Promise<Workspace>;
  update(id: string, data: WorkspacePatchData): Promise<Workspace>;
  getAgentTokenHash(id: string): Promise<string | null>;
}
