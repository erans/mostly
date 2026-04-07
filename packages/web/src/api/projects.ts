import type { Project, ListParams } from '@mostly/types';
import { apiFetch } from './client';

interface ListResponse<T> { data: { items: T[]; next_cursor: string | null } }
interface SingleResponse<T> { data: T }

export function listProjects(params: Partial<ListParams> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const query = qs.toString();
  return apiFetch<ListResponse<Project>>(`/v0/projects${query ? `?${query}` : ''}`);
}

export function getProject(id: string) {
  return apiFetch<SingleResponse<Project>>(`/v0/projects/${encodeURIComponent(id)}`);
}
