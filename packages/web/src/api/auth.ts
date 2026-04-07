import type {
  Principal,
  ApiKey,
  RegisterRequest,
  LoginRequest,
  CreateApiKeyRequest,
} from '@mostly/types';
import { apiFetch } from './client';

interface SingleResponse<T> { data: T }
interface ListResponse<T> { data: { items: T[] } }

export function register(req: RegisterRequest): Promise<Principal> {
  return apiFetch<SingleResponse<Principal>>('/v0/auth/register', {
    method: 'POST',
    body: JSON.stringify(req),
  }).then((res) => res.data);
}

export function login(req: LoginRequest): Promise<Principal> {
  return apiFetch<SingleResponse<Principal>>('/v0/auth/login', {
    method: 'POST',
    body: JSON.stringify(req),
  }).then((res) => res.data);
}

export async function logout(): Promise<void> {
  await apiFetch<SingleResponse<{ success: boolean }>>('/v0/auth/logout', {
    method: 'POST',
  });
}

export function getMe(): Promise<Principal> {
  return apiFetch<SingleResponse<Principal>>('/v0/auth/me').then((res) => res.data);
}

export function createApiKey(
  req: CreateApiKeyRequest,
): Promise<ApiKey & { key: string }> {
  return apiFetch<SingleResponse<ApiKey & { key: string }>>('/v0/auth/api-keys', {
    method: 'POST',
    body: JSON.stringify(req),
  }).then((res) => res.data);
}

export function listApiKeys(): Promise<ApiKey[]> {
  return apiFetch<ListResponse<ApiKey>>('/v0/auth/api-keys').then((res) => res.data.items);
}

export async function revokeApiKey(id: string): Promise<void> {
  await apiFetch<SingleResponse<{ success: boolean }>>(
    `/v0/auth/api-keys/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}
