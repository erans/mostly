/**
 * Extract the first task key matching `<projectKey>-<digits>` from a branch
 * name. Case-sensitive match on the project key. Returns null if no match
 * or if branch is null (detached HEAD).
 */
export function inferTaskFromBranch(branch: string | null, projectKey: string): string | null {
  if (!branch) return null;
  const escaped = projectKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[^A-Za-z0-9])(${escaped})-(\\d+)(?:[^A-Za-z0-9]|$)`);
  const m = branch.match(re);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}
