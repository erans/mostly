import { generateId, ID_PREFIXES } from '@mostly/types';
import type { Workspace, Principal, Project, Task, TaskUpdate } from '@mostly/types';

const now = () => new Date().toISOString();

export function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  const ts = now();
  return {
    id: generateId(ID_PREFIXES.workspace), slug: 'default', name: 'Default',
    created_at: ts, updated_at: ts,
    ...overrides,
  };
}

export function makePrincipal(overrides: Partial<Principal> = {}): Principal {
  const ts = now();
  return {
    id: generateId(ID_PREFIXES.principal), workspace_id: generateId(ID_PREFIXES.workspace), handle: 'test-user', kind: 'human',
    display_name: null, metadata_json: null, is_active: true,
    created_at: ts, updated_at: ts,
    ...overrides,
  };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  const ts = now();
  const actorId = generateId(ID_PREFIXES.principal);
  return {
    id: generateId(ID_PREFIXES.project), workspace_id: generateId(ID_PREFIXES.workspace), key: 'TEST', name: 'Test Project',
    description: null, is_archived: false, created_by_id: actorId,
    updated_by_id: actorId, created_at: ts, updated_at: ts,
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  const ts = now();
  const actorId = generateId(ID_PREFIXES.principal);
  return {
    id: generateId(ID_PREFIXES.task), workspace_id: generateId(ID_PREFIXES.workspace), project_id: null, key: 'TASK-1',
    type: 'bug', title: 'Test task', description: null, status: 'open',
    resolution: null, assignee_id: null, claimed_by_id: null,
    claim_expires_at: null, version: 1, created_by_id: actorId,
    updated_by_id: actorId, resolved_at: null, created_at: ts, updated_at: ts,
    ...overrides,
  };
}

export function makeTaskUpdate(overrides: Partial<TaskUpdate> = {}): TaskUpdate {
  const ts = now();
  return {
    id: generateId(ID_PREFIXES.taskUpdate), task_id: generateId(ID_PREFIXES.task), kind: 'note', body: 'Test update.',
    metadata_json: null, created_by_id: generateId(ID_PREFIXES.principal), created_at: ts,
    ...overrides,
  };
}
