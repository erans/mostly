import { z } from 'zod';

// --- Workspace ---

export const WorkspaceSchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  name: z.string().min(1),
  allow_registration: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

// --- Principal ---

export const PrincipalSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  handle: z.string().min(1),
  kind: z.enum(['human', 'agent', 'service']),
  display_name: z.string().nullable(),
  metadata_json: z.record(z.unknown()).nullable(),
  is_active: z.boolean(),
  is_admin: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Principal = z.infer<typeof PrincipalSchema>;

// --- Project ---

export const ProjectSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  key: z.string().regex(/^[A-Z0-9]+$/, 'key must be uppercase letters and digits only'),
  name: z.string().min(1),
  description: z.string().nullable(),
  is_archived: z.boolean(),
  created_by_id: z.string(),
  updated_by_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

// --- Task ---

export const TaskSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  project_id: z.string().nullable(),
  key: z.string(),
  type: z.enum(['feature', 'bug', 'chore', 'research', 'incident', 'question']),
  title: z.string().min(1),
  description: z.string().nullable(),
  status: z.enum(['open', 'claimed', 'in_progress', 'blocked', 'closed', 'canceled']),
  resolution: z.enum(['completed', 'duplicate', 'invalid', 'wont_do', 'deferred']).nullable(),
  assignee_id: z.string().nullable(),
  claimed_by_id: z.string().nullable(),
  claim_expires_at: z.string().nullable(),
  version: z.number().int().positive(),
  created_by_id: z.string(),
  updated_by_id: z.string(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;

// --- TaskUpdate ---

export const TaskUpdateSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  kind: z.enum([
    'note', 'progress', 'plan', 'decision', 'handoff', 'result',
    'status', 'claim', 'system',
  ]),
  body: z.string(),
  metadata_json: z.record(z.unknown()).nullable(),
  created_by_id: z.string(),
  created_at: z.string(),
});
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>;

// --- AgentActionContext ---

export const AgentActionContextSchema = z.object({
  id: z.string(),
  task_update_id: z.string(),
  principal_id: z.string(),
  session_id: z.string().nullable(),
  run_id: z.string().nullable(),
  tool_name: z.string().nullable(),
  tool_call_id: z.string().nullable(),
  source_kind: z.enum([
    'cli_session', 'github_issue', 'github_pull_request',
    'slack_message', 'webhook', 'api_request',
  ]).nullable(),
  source_ref: z.string().nullable(),
  metadata_json: z.record(z.unknown()).nullable(),
  created_at: z.string(),
});
export type AgentActionContext = z.infer<typeof AgentActionContextSchema>;
