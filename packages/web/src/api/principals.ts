import type { Principal, ListParams } from '@mostly/types';
import { apiFetch } from './client';

interface ListResponse<T> { data: { items: T[]; next_cursor: string | null } }

export function listPrincipals(params: Partial<ListParams> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const query = qs.toString();
  return apiFetch<ListResponse<Principal>>(`/v0/principals${query ? `?${query}` : ''}`);
}
