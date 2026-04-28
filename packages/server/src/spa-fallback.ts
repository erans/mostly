const STATIC_ASSET_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.css', '.map',
  '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.eot',
  '.json', '.txt', '.xml', '.csv',
  '.html', '.htm',
  '.webmanifest', '.pdf', '.wasm', '.gz', '.br', '.zst',
  '.mp3', '.mp4', '.webm', '.ogg',
  '.ts', '.tsx', '.jsx', '.vue', '.svelte',
  '.yaml', '.yml', '.toml',
  '.zip', '.tar', '.tgz',
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
