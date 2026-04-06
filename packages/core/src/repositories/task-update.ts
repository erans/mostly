import type { TaskUpdate, AgentActionContext } from '@mostly/types';
import type { PaginatedResult } from './types.js';

export interface TaskUpdateCreateData {
  id: string;
  task_id: string;
  kind: string;
  body: string;
  metadata_json: Record<string, unknown> | null;
  created_by_id: string;
  created_at: string;
}

export interface AgentActionContextCreateData {
  id: string;
  task_update_id: string;
  principal_id: string;
  session_id: string | null;
  run_id: string | null;
  tool_name: string | null;
  tool_call_id: string | null;
  source_kind: string | null;
  source_ref: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface TaskUpdateRepository {
  list(taskId: string, cursor?: string, limit?: number): Promise<PaginatedResult<TaskUpdate>>;
  create(data: TaskUpdateCreateData): Promise<TaskUpdate>;
  createWithAgentContext(
    data: TaskUpdateCreateData,
    contexts: AgentActionContextCreateData[],
  ): Promise<TaskUpdate>;
}
