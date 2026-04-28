/**
 * Canonicalize a --subpath option value so that trailing slashes,
 * leading slashes, leading "./" and surrounding whitespace are all
 * normalised away, and backslashes are converted to forward-slashes.
 *
 * Examples:
 *   undefined         → ''
 *   ''                → ''
 *   'packages/auth'   → 'packages/auth'
 *   'packages/auth/'  → 'packages/auth'
 *   '/packages/auth'  → 'packages/auth'
 *   './packages/auth' → 'packages/auth'
 *   'packages\\auth'  → 'packages/auth'
 */
export function canonSubpath(input: string | undefined): string {
  if (!input) return '';
  let s = input.trim().replaceAll('\\', '/');
  while (s.startsWith('./')) s = s.slice(2);
  while (s.startsWith('/')) s = s.slice(1);
  while (s.endsWith('/')) s = s.slice(0, -1);
  return s;
}
