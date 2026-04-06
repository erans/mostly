export const PrincipalKind = {
  human: 'human',
  agent: 'agent',
  service: 'service',
} as const;
export type PrincipalKind = (typeof PrincipalKind)[keyof typeof PrincipalKind];

export const TaskType = {
  feature: 'feature',
  bug: 'bug',
  chore: 'chore',
  research: 'research',
  incident: 'incident',
  question: 'question',
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export const TaskStatus = {
  open: 'open',
  claimed: 'claimed',
  in_progress: 'in_progress',
  blocked: 'blocked',
  closed: 'closed',
  canceled: 'canceled',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const Resolution = {
  completed: 'completed',
  duplicate: 'duplicate',
  invalid: 'invalid',
  wont_do: 'wont_do',
  deferred: 'deferred',
} as const;
export type Resolution = (typeof Resolution)[keyof typeof Resolution];

export const TERMINAL_STATUSES: readonly TaskStatus[] = [
  TaskStatus.closed,
  TaskStatus.canceled,
];

export const RESOLUTION_FOR_STATUS: Record<string, readonly Resolution[]> = {
  [TaskStatus.closed]: [Resolution.completed, Resolution.duplicate, Resolution.invalid],
  [TaskStatus.canceled]: [Resolution.wont_do, Resolution.deferred],
};

export const TaskUpdateKind = {
  note: 'note',
  progress: 'progress',
  plan: 'plan',
  decision: 'decision',
  handoff: 'handoff',
  result: 'result',
  status: 'status',
  claim: 'claim',
  system: 'system',
} as const;
export type TaskUpdateKind = (typeof TaskUpdateKind)[keyof typeof TaskUpdateKind];

export const SourceKind = {
  cli_session: 'cli_session',
  github_issue: 'github_issue',
  github_pull_request: 'github_pull_request',
  slack_message: 'slack_message',
  webhook: 'webhook',
  api_request: 'api_request',
} as const;
export type SourceKind = (typeof SourceKind)[keyof typeof SourceKind];
