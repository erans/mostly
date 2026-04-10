const STATIC_ASSET_EXTENSIONS = new Set([
  '.js', '.css', '.map', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.json', '.txt', '.xml', '.webp',
  '.webmanifest', '.html', '.htm',
]);

/** Returns true when a request should receive the SPA index.html fallback. */
export function isSpaFallbackPath(method: string, path: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (path === '/v0' || path.startsWith('/v0/') || path === '/healthz') return false;
  // Known static asset extensions should 404 naturally if missing
  const dotIdx = path.lastIndexOf('.');
  if (dotIdx > path.lastIndexOf('/')) {
    const ext = path.slice(dotIdx).toLowerCase();
    if (STATIC_ASSET_EXTENSIONS.has(ext)) return false;
  }
  return true;
}
