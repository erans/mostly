/**
 * Canonical form: host[:port]/owner/repo. Lowercase host, no scheme,
 * no auth, no .git suffix, no trailing slash, no query/fragment.
 *
 * Handles HTTPS, HTTP, SSH (`ssh://...`), and SCP-style (`git@host:owner/repo`).
 */
export function normalizeGitUrl(input: string): string {
  if (!input) throw new Error('empty git url');
  let s = input.trim();

  // Reject empty-authority URLs like http:///path (triple-slash = no host).
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\//.test(s)) {
    throw new Error(`git url missing host: ${input}`);
  }

  // SCP-style: git@host:owner/repo[.git]
  // Only apply when there is no URL scheme already present (scheme = word chars before
  // the first colon, with no '@' sign before that colon).
  const scpMatch = s.match(/^([^@\s]+@)?([^:/\s]+):(.+)$/);
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) && !s.slice(0, s.indexOf(':')).includes('@');
  if (scpMatch && !hasScheme) {
    s = `ssh://${scpMatch[1] ?? ''}${scpMatch[2]}/${scpMatch[3]}`;
  }

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new Error(`unrecognized git url: ${input}`);
  }

  const allowedSchemes = ['http:', 'https:', 'ssh:'];
  if (!allowedSchemes.includes(url.protocol)) {
    throw new Error(`unsupported git url scheme: ${input}`);
  }

  if (url.hostname === '') {
    throw new Error(`git url missing host: ${input}`);
  }

  let host = url.hostname.toLowerCase();
  if (url.port) host += `:${url.port}`;

  let path = url.pathname.toLowerCase();
  if (path.endsWith('.git')) path = path.slice(0, -4);
  while (path.endsWith('/')) path = path.slice(0, -1);
  if (path.startsWith('/')) path = path.slice(1);

  if (!path) throw new Error(`git url missing path: ${input}`);
  return `${host}/${path}`;
}
