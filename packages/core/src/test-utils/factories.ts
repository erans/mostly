import { ulid } from 'ulid';
import type { Workspace, Principal, Project, Task, TaskUpdate } from '@mostly/types';

const now = () => new Date().toISOString();

export function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  const ts = now();
  return {
    id: ulid(), slug: 'default', name: 'Default',
    created_at: ts, updated_at: ts,
    ...overrides,
  };
}

export function makePrincipal(overrides: Partial<Principal> = {}): Principal {
  const ts = now();
  return {
    id: ulid(), workspace_id: ulid(), handle: 'test-user', kind: 'human',
    display_name: null, metadata_json: null, is_active: true,
    created_at: ts, updated_at: ts,
    ...overrides,
  };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  const ts = now();
  const actorId = ulid();
  return {
    id: ulid(), workspace_id: ulid(), key: 'TEST', name: 'Test Project',
    description: null, is_archived: false, created_by_id: actorId,
    updated_by_id: actorId, created_at: ts, updated_at: ts,
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  const ts = now();
  const actorId = ulid();
  return {
    id: ulid(), workspace_id: ulid(), project_id: null, key: 'TASK-1',
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
    id: ulid(), task_id: ulid(), kind: 'note', body: 'Test update.',
    metadata_json: null, created_by_id: ulid(), created_at: ts,
    ...overrides,
  };
}
