import path from 'node:path';
import type { GitRunner } from './git-runner.js';
import { normalizeGitUrl } from './git-url.js';

export interface GitRemote {
  name: string;
  normalized_url: string;
}

export interface GitContext {
  repoRoot: string;
  remotes: GitRemote[];
  relPath: string;
  branch: string | null;
  authorEmail: string | null;
}

async function tryRun(runner: GitRunner, cwd: string, args: string[]): Promise<string | null> {
  try {
    return (await runner.run(cwd, args)).trim();
  } catch {
    return null;
  }
}

export async function gatherGitContext(cwd: string, runner: GitRunner): Promise<GitContext | null> {
  const repoRoot = await tryRun(runner, cwd, ['rev-parse', '--show-toplevel']);
  if (!repoRoot) return null;

  const remotesOut = (await tryRun(runner, cwd, ['remote', '-v'])) ?? '';
  const branchRaw = await tryRun(runner, cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const email = await tryRun(runner, cwd, ['config', 'user.email']);

  const seen = new Set<string>();
  const remotes: GitRemote[] = [];
  for (const line of remotesOut.split('\n')) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!m) continue;
    if (m[3] !== 'fetch') continue;
    const name = m[1];
    if (seen.has(name)) continue;
    let normalized: string;
    try {
      normalized = normalizeGitUrl(m[2]);
    } catch {
      continue;
    }
    seen.add(name);
    remotes.push({ name, normalized_url: normalized });
  }

  remotes.sort((a, b) => (a.name === 'origin' ? -1 : b.name === 'origin' ? 1 : 0));

  const relPath = path.relative(repoRoot, cwd).replaceAll(path.sep, '/');
  const branch = branchRaw && branchRaw !== 'HEAD' ? branchRaw : null;

  return {
    repoRoot,
    remotes,
    relPath,
    branch,
    authorEmail: email && email.length > 0 ? email : null,
  };
}
