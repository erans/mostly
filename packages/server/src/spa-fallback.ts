/** Returns true when a request should receive the SPA index.html fallback. */
export function isSpaFallbackPath(method: string, path: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (path === '/v0' || path.startsWith('/v0/') || path === '/healthz') return false;
  // Paths with a file extension are static asset requests — let them 404 naturally
  const lastSegment = path.split('/').pop() ?? '';
  if (lastSegment.includes('.')) return false;
  return true;
}
