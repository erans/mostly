import type { ApiKey } from '@mostly/types';

export interface ApiKeyCreateData {
  id: string;
  principal_id: string;
  workspace_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiKeyRepository {
  findByHash(keyHash: string): Promise<(ApiKey & { key_hash: string }) | null>;
  findByPrincipalAndName(principalId: string, name: string): Promise<ApiKey | null>;
  listByPrincipal(principalId: string): Promise<ApiKey[]>;
  create(data: ApiKeyCreateData): Promise<ApiKey>;
  deactivate(id: string): Promise<void>;
  updateLastUsed(id: string, lastUsedAt: string): Promise<void>;
}
