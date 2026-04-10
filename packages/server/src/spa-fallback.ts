/** Returns true when a request should receive the SPA index.html fallback. */
export function isSpaFallbackPath(method: string, path: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (path === '/v0' || path.startsWith('/v0/') || path === '/healthz') return false;
  return true;
}
