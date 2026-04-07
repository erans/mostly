import type { Session } from '@mostly/types';

export interface SessionCreateData {
  id: string;
  principal_id: string;
  workspace_id: string;
  expires_at: string;
  created_at: string;
}

export interface SessionRepository {
  findById(id: string): Promise<Session | null>;
  create(data: SessionCreateData): Promise<Session>;
  updateExpiresAt(id: string, expiresAt: string): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByPrincipalId(principalId: string): Promise<void>;
}
