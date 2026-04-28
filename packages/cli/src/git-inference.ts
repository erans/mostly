import {
  gatherGitContext,
  inferTaskFromBranch,
  type GitRunner,
  RealGitRunner,
} from '@mostly/core';
import type { MostlyClient } from './client.js';

export interface GitInferenceResult {
  projectKey?: string;
  projectId?: string;
  taskKey?: string;
  actorHandle?: string;
  source: {
    project: 'flag' | 'git:origin' | 'git:resolve' | 'none';
    task: 'flag' | 'git:branch' | 'none';
    actor: 'flag' | 'git:email' | 'ambiguous' | 'none';
  };
  notes: string[];
}

export interface ResolveGitContextOpts {
  cwd: string;
  client: MostlyClient;
  disabled: boolean;
  runner?: GitRunner;
}

export async function resolveGitContext(opts: ResolveGitContextOpts): Promise<GitInferenceResult> {
  const empty: GitInferenceResult = { source: { project: 'none', task: 'none', actor: 'none' }, notes: [] };
  if (opts.disabled) return empty;

  const ctx = await gatherGitContext(opts.cwd, opts.runner ?? new RealGitRunner());
  if (!ctx) return empty;

  const result: GitInferenceResult = { ...empty, notes: [] };

  if (ctx.remotes.length > 0) {
    try {
      const r = await opts.client.post('/v0/git-context/resolve', {
        urls: ctx.remotes.map((r) => r.normalized_url),
        rel_path: ctx.relPath,
      });
      if (r.data) {
        result.projectKey = r.data.project_key;
        result.projectId = r.data.project_id;
        result.source.project = 'git:resolve';
      }
    } catch (err: any) {
      // 4xx from the server is a deliberate refusal; don't swallow it.
      if (err && typeof err.status === 'number' && err.status >= 400 && err.status < 500) {
        throw err;
      }
      result.notes.push(`(git-context resolve failed: ${err.message ?? 'unknown'})`);
    }
  }

  if (result.projectKey && ctx.branch) {
    const taskKey = inferTaskFromBranch(ctx.branch, result.projectKey);
    if (taskKey) {
      result.taskKey = taskKey;
      result.source.task = 'git:branch';
    }
  }

  if (ctx.authorEmail) {
    try {
      const r = await opts.client.get(`/v0/principals?email=${encodeURIComponent(ctx.authorEmail)}`);
      const matches = (r.data ?? []) as Array<{ id: string; handle: string; is_active: boolean }>;
      const active = matches.filter((p) => p.is_active);
      if (active.length === 1) {
        result.actorHandle = active[0].handle;
        result.source.actor = 'git:email';
      } else if (active.length > 1) {
        result.source.actor = 'ambiguous';
        result.notes.push(`(actor not inferred: ${active.length} principals match ${ctx.authorEmail})`);
      }
    } catch (err: any) {
      result.notes.push(`(principal email lookup failed: ${err.message ?? 'unknown'})`);
    }
  }

  return result;
}

export function formatInferenceNote(r: GitInferenceResult): string | null {
  const parts: string[] = [];
  if (r.source.project === 'git:resolve' && r.projectKey) parts.push(`project=${r.projectKey}`);
  if (r.source.task === 'git:branch' && r.taskKey) parts.push(`task=${r.taskKey}`);
  if (r.source.actor === 'git:email' && r.actorHandle) parts.push(`actor=${r.actorHandle}`);
  if (parts.length === 0) return null;
  return `(inferred: ${parts.join(', ')})`;
}
