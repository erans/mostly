import type { Principal } from '@mostly/types';
import type { PaginatedResult } from './types.js';

export interface PrincipalCreateData {
  id: string;
  workspace_id: string;
  handle: string;
  kind: string;
  display_name: string | null;
  metadata_json: Record<string, unknown> | null;
  password_hash: string | null;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface PrincipalPatchData {
  display_name?: string | null;
  kind?: string;
  metadata_json?: Record<string, unknown> | null;
  password_hash?: string | null;
  is_active?: boolean;
  is_admin?: boolean;
  updated_at: string;
}

export interface PrincipalRepository {
  findById(id: string): Promise<Principal | null>;
  findByHandle(workspaceId: string, handle: string): Promise<Principal | null>;
  list(workspaceId: string, cursor?: string, limit?: number): Promise<PaginatedResult<Principal>>;
  listHumans(workspaceId: string): Promise<Principal[]>;
  create(data: PrincipalCreateData): Promise<Principal>;
  update(id: string, data: PrincipalPatchData): Promise<Principal>;
  getPasswordHash(id: string): Promise<string | null>;
}
