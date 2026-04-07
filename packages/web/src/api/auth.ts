import type {
  Principal,
  ApiKey,
  RegisterRequest,
  LoginRequest,
  CreateApiKeyRequest,
} from '@mostly/types';
import { apiFetch } from './client';

// Convention: these functions return the wrapped {data: ...} envelope to
// match `principals.ts`/`tasks.ts`. Consumers unwrap inline. The two
// exceptions are `logout` and `revokeApiKey`, which return `Promise<void>`
// because their response bodies are uninteresting (a `{success: true}`
// acknowledgement that no caller currently inspects).

interface SingleResponse<T> { data: T }
interface ListResponse<T> { data: { items: T[] } }

export function register(req: RegisterRequest): Promise<SingleResponse<Principal>> {
  return apiFetch<SingleResponse<Principal>>('/v0/auth/register', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function login(req: LoginRequest): Promise<SingleResponse<Principal>> {
  return apiFetch<SingleResponse<Principal>>('/v0/auth/login', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function logout(): Promise<void> {
  await apiFetch<SingleResponse<{ success: boolean }>>('/v0/auth/logout', {
    method: 'POST',
  });
}

export function getMe(): Promise<SingleResponse<Principal>> {
  return apiFetch<SingleResponse<Principal>>('/v0/auth/me');
}

export function createApiKey(
  req: CreateApiKeyRequest,
): Promise<SingleResponse<ApiKey & { key: string }>> {
  return apiFetch<SingleResponse<ApiKey & { key: string }>>('/v0/auth/api-keys', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function listApiKeys(): Promise<ListResponse<ApiKey>> {
  return apiFetch<ListResponse<ApiKey>>('/v0/auth/api-keys');
}

export async function revokeApiKey(id: string): Promise<void> {
  await apiFetch<SingleResponse<{ success: boolean }>>(
    `/v0/auth/api-keys/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}
