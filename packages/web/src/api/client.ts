import type { ApiErrorResponse } from '@mostly/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ClientConfig {
  baseUrl: string;
  token: string;
}

let globalConfig: ClientConfig | null = null;

export function setClientConfig(config: ClientConfig) {
  globalConfig = config;
}

export function getClientConfig(): ClientConfig {
  if (!globalConfig) throw new Error('API client not configured — call setClientConfig first');
  return globalConfig;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { baseUrl, token } = getClientConfig();
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    let body: ApiErrorResponse | undefined;
    try {
      body = await res.json();
    } catch {
      // ignore parse errors
    }
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'unknown',
      body?.error?.message ?? `HTTP ${res.status}`,
      body?.error?.details,
    );
  }

  return res.json() as Promise<T>;
}
