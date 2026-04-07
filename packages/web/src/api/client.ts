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

let baseUrl: string | null = null;

export function setBaseUrl(url: string): void {
  baseUrl = url;
}

function getBaseUrl(): string {
  if (!baseUrl) throw new Error('API client not configured — call setBaseUrl first');
  return baseUrl;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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
