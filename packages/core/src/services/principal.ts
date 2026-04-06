import { ulid } from 'ulid';
import { NotFoundError, InvalidArgumentError } from '@mostly/types';
import type { Principal } from '@mostly/types';
import type { PrincipalRepository, PaginatedResult } from '../repositories/index.js';

export interface CreatePrincipalInput {
  handle: string;
  kind: string;
  display_name?: string | null;
  metadata_json?: Record<string, unknown> | null;
}

export class PrincipalService {
  constructor(private principals: PrincipalRepository) {}

  async create(workspaceId: string, input: CreatePrincipalInput): Promise<Principal> {
    const existing = await this.principals.findByHandle(workspaceId, input.handle);
    if (existing) {
      throw new InvalidArgumentError(`principal with handle "${input.handle}" already exists`);
    }
    const now = new Date().toISOString();
    return this.principals.create({
      id: ulid(),
      workspace_id: workspaceId,
      handle: input.handle,
      kind: input.kind,
      display_name: input.display_name ?? null,
      metadata_json: input.metadata_json ?? null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
  }

  async get(id: string): Promise<Principal> {
    const p = await this.principals.findById(id);
    if (!p) throw new NotFoundError('principal', id);
    return p;
  }

  async getByHandle(workspaceId: string, handle: string): Promise<Principal> {
    const p = await this.principals.findByHandle(workspaceId, handle);
    if (!p) throw new NotFoundError('principal', handle);
    return p;
  }

  async list(workspaceId: string, cursor?: string, limit?: number): Promise<PaginatedResult<Principal>> {
    return this.principals.list(workspaceId, cursor, limit);
  }

  async update(id: string, input: Partial<Pick<Principal, 'display_name' | 'kind' | 'metadata_json' | 'is_active'>>): Promise<Principal> {
    const existing = await this.principals.findById(id);
    if (!existing) throw new NotFoundError('principal', id);
    return this.principals.update(id, {
      ...input,
      updated_at: new Date().toISOString(),
    });
  }
}
