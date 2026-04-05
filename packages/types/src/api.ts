import { z } from 'zod';

// --- Actor identification (included in all mutations) ---

const ActorFields = z.object({
  actor_id: z.string().optional(),
  actor_handle: z.string().optional(),
});

// --- Principal ---

export const CreatePrincipalRequest = z.object({
  handle: z.string().min(1),
  kind: z.enum(['human', 'agent', 'service']),
  display_name: z.string().nullable().optional(),
  metadata_json: z.record(z.unknown()).nullable().optional(),
}).merge(ActorFields);
export type CreatePrincipalRequest = z.infer<typeof CreatePrincipalRequest>;

export const PatchPrincipalRequest = z.object({
  display_name: z.string().nullable().optional(),
  kind: z.enum(['human', 'agent', 'service']).optional(),
  metadata_json: z.record(z.unknown()).nullable().optional(),
  is_active: z.boolean().optional(),
}).merge(ActorFields);
export type PatchPrincipalRequest = z.infer<typeof PatchPrincipalRequest>;

// --- Project ---

export const CreateProjectRequest = z.object({
  key: z.string().regex(/^[A-Z0-9]+$/, 'key must be uppercase letters and digits only'),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
}).merge(ActorFields);
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;

export const PatchProjectRequest = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  is_archived: z.boolean().optional(),
}).merge(ActorFields);
export type PatchProjectRequest = z.infer<typeof PatchProjectRequest>;

// --- Task ---

export const CreateTaskRequest = z.object({
  project_id: z.string().nullable().optional(),
  type: z.enum(['feature', 'bug', 'chore', 'research', 'incident', 'question']),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  assignee_id: z.string().nullable().optional(),
}).merge(ActorFields);
export type CreateTaskRequest = z.infer<typeof CreateTaskRequest>;

export const PatchTaskRequest = z.object({
  project_id: z.string().nullable().optional(),
  type: z.enum(['feature', 'bug', 'chore', 'research', 'incident', 'question']).optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assignee_id: z.string().nullable().optional(),
  expected_version: z.number().int().positive(),
}).merge(ActorFields);
export type PatchTaskRequest = z.infer<typeof PatchTaskRequest>;

// --- Transition ---

export const TransitionTaskRequest = z.object({
  to_status: z.enum(['open', 'claimed', 'in_progress', 'blocked', 'closed', 'canceled']),
  resolution: z.enum(['completed', 'duplicate', 'invalid', 'wont_do', 'deferred']).nullable().optional(),
  expected_version: z.number().int().positive(),
}).merge(ActorFields);
export type TransitionTaskRequest = z.infer<typeof TransitionTaskRequest>;

// --- Claims ---

export const AcquireClaimRequest = z.object({
  claim_expires_at: z.string().nullable().optional(),
  expected_version: z.number().int().positive(),
}).merge(ActorFields);
export type AcquireClaimRequest = z.infer<typeof AcquireClaimRequest>;

export const RenewClaimRequest = z.object({
  claim_expires_at: z.string().nullable().optional(),
  expected_version: z.number().int().positive(),
}).merge(ActorFields);
export type RenewClaimRequest = z.infer<typeof RenewClaimRequest>;

export const ReleaseClaimRequest = z.object({
  expected_version: z.number().int().positive(),
}).merge(ActorFields);
export type ReleaseClaimRequest = z.infer<typeof ReleaseClaimRequest>;

// --- Task Updates ---

const AgentActionContextInput = z.object({
  session_id: z.string().nullable().optional(),
  run_id: z.string().nullable().optional(),
  tool_name: z.string().nullable().optional(),
  tool_call_id: z.string().nullable().optional(),
  source_kind: z.enum([
    'cli_session', 'github_issue', 'github_pull_request',
    'slack_message', 'webhook', 'api_request',
  ]).nullable().optional(),
  source_ref: z.string().nullable().optional(),
  metadata_json: z.record(z.unknown()).nullable().optional(),
});

export const CreateTaskUpdateRequest = z.object({
  kind: z.enum([
    'note', 'progress', 'plan', 'decision', 'handoff', 'result',
    'status', 'claim', 'system',
  ]),
  body: z.string().min(1),
  metadata_json: z.record(z.unknown()).nullable().optional(),
  agent_action_contexts: z.array(AgentActionContextInput).optional(),
}).merge(ActorFields);
export type CreateTaskUpdateRequest = z.infer<typeof CreateTaskUpdateRequest>;

// --- Response envelopes ---

export const ApiResponse = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ data: schema });

export const ApiListResponse = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    data: z.object({
      items: z.array(schema),
      next_cursor: z.string().nullable(),
    }),
  });

export const ApiErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string()).optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponse>;

// --- List query params ---

export const TaskListParams = z.object({
  status: z.string().optional(),
  assignee_id: z.string().optional(),
  project_id: z.string().optional(),
  claimed_by_id: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50).optional(),
});
export type TaskListParams = z.infer<typeof TaskListParams>;

export const ListParams = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50).optional(),
});
export type ListParams = z.infer<typeof ListParams>;
