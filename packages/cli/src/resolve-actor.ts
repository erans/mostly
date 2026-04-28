import { loadConfig, type ResolvedConfig } from './config.js';
import { MostlyClient } from './client.js';
import type { GitInferenceResult } from './git-inference.js';

export interface ResolvedActorContext {
  config: ResolvedConfig;
  client: MostlyClient;
}

/**
 * Resolve the acting principal with the priority mandated by the spec:
 *   1. Explicit --actor flag (opts.actor)
 *   2. Inferred from git context (inf.actorHandle)
 *   3. Whatever the base config already has (baseConfig.actor / API key)
 *
 * When the resolved target differs from what the base config already carries,
 * we re-load config so the new actor's credentials are used for the request.
 */
export function resolveActor(
  opts: { actor?: string },
  inf: GitInferenceResult,
  baseConfig: ResolvedConfig,
): ResolvedActorContext {
  const target = opts.actor ?? inf.actorHandle;
  if (!target || target === baseConfig.actor) {
    return { config: baseConfig, client: MostlyClient.fromConfig(baseConfig) };
  }
  const next = loadConfig({ actor: target });
  return { config: next, client: MostlyClient.fromConfig(next) };
}
