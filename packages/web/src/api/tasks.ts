import type {
  Task, TaskUpdate,
  CreateTaskRequest, PatchTaskRequest, TransitionTaskRequest,
  AcquireClaimRequest, ReleaseClaimRequest,
  CreateTaskUpdateRequest, TaskListParams,
} from '@mostly/types';
import { apiFetch } from './client';

interface ListResponse<T> { data: { items: T[]; next_cursor: string | null } }
interface SingleResponse<T> { data: T }

export function listTasks(params: Partial<TaskListParams> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const query = qs.toString();
  return apiFetch<ListResponse<Task>>(`/v0/tasks${query ? `?${query}` : ''}`);
}

export function getTask(id: string) {
  return apiFetch<SingleResponse<Task>>(`/v0/tasks/${encodeURIComponent(id)}`);
}

export function createTask(body: CreateTaskRequest) {
  return apiFetch<SingleResponse<Task>>('/v0/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function editTask(id: string, body: PatchTaskRequest) {
  return apiFetch<SingleResponse<Task>>(`/v0/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function transitionTask(id: string, body: TransitionTaskRequest) {
  return apiFetch<SingleResponse<Task>>(`/v0/tasks/${encodeURIComponent(id)}/transition`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function claimTask(id: string, body: AcquireClaimRequest) {
  return apiFetch<SingleResponse<Task>>(`/v0/tasks/${encodeURIComponent(id)}/claim`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function releaseTask(id: string, body: ReleaseClaimRequest) {
  return apiFetch<SingleResponse<Task>>(`/v0/tasks/${encodeURIComponent(id)}/release-claim`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listTaskUpdates(taskId: string, params: { cursor?: string; limit?: number } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const query = qs.toString();
  return apiFetch<ListResponse<TaskUpdate>>(
    `/v0/tasks/${encodeURIComponent(taskId)}/updates${query ? `?${query}` : ''}`,
  );
}

export function addTaskUpdate(taskId: string, body: CreateTaskUpdateRequest) {
  return apiFetch<SingleResponse<TaskUpdate>>(
    `/v0/tasks/${encodeURIComponent(taskId)}/updates`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}
