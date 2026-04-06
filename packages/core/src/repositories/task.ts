import type { Task } from '@mostly/types';
import type { PaginatedResult, TaskListFilters } from './types.js';

export interface TaskCreateData {
  id: string;
  workspace_id: string;
  project_id: string | null;
  key: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  resolution: string | null;
  assignee_id: string | null;
  claimed_by_id: string | null;
  claim_expires_at: string | null;
  version: number;
  created_by_id: string;
  updated_by_id: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskUpdateData {
  project_id?: string | null;
  type?: string;
  title?: string;
  description?: string | null;
  status?: string;
  resolution?: string | null;
  assignee_id?: string | null;
  claimed_by_id?: string | null;
  claim_expires_at?: string | null;
  version: number;
  updated_by_id: string;
  resolved_at?: string | null;
  updated_at: string;
}

export interface TaskRepository {
  findById(id: string): Promise<Task | null>;
  findByKey(workspaceId: string, key: string): Promise<Task | null>;
  list(workspaceId: string, filters: TaskListFilters, cursor?: string, limit?: number): Promise<PaginatedResult<Task>>;
  create(data: TaskCreateData): Promise<Task>;
  update(id: string, data: TaskUpdateData, expectedVersion: number): Promise<Task>;
  nextKeyNumber(workspaceId: string, prefix: string): Promise<number>;
  findWithExpiredClaims(workspaceId: string): Promise<Task[]>;
}
