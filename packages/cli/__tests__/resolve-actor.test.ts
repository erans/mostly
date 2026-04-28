import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveActor } from '../src/resolve-actor.js';
import type { GitInferenceResult } from '../src/git-inference.js';
import { MostlyClient } from '../src/client.js';

vi.mock('../src/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config.js')>();
  return {
    ...actual,
    loadConfig: vi.fn((overrides?: { actor?: string }) => ({
      serverUrl: 'http://mocked',
      apiKey: 'mocked-key',
      actor: overrides?.actor ?? 'default-actor',
    })),
  };
});

vi.mock('../src/client.js', () => {
  const fromConfig = vi.fn((cfg: any) => ({ _actor: cfg.actor, _url: cfg.serverUrl }));
  return { MostlyClient: { fromConfig } };
});

describe('resolveActor', () => {
  const emptyInf: GitInferenceResult = {
    source: { project: 'none' as const, task: 'none' as const, actor: 'none' as const },
    notes: [],
  };

  const baseConfig = { serverUrl: 'http://x', apiKey: 'k', actor: 'default' } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses explicit --actor when provided, even when inferred actor differs', () => {
    const inf = { ...emptyInf, actorHandle: 'inferred' };
    const { config } = resolveActor({ actor: 'explicit' }, inf, baseConfig);
    // loadConfig should have been called with actor: 'explicit'
    expect(config.actor).toBe('explicit');
  });

  it('falls back to inferred actor when --actor is absent', () => {
    const inf = { ...emptyInf, actorHandle: 'inferred' };
    const { config } = resolveActor({}, inf, baseConfig);
    expect(config.actor).toBe('inferred');
  });

  it('falls back to base config actor when neither --actor nor inferred is set', () => {
    const { config, client } = resolveActor({}, emptyInf, baseConfig);
    // No reload — returns baseConfig directly
    expect(config).toBe(baseConfig);
    expect(MostlyClient.fromConfig).toHaveBeenCalledWith(baseConfig);
  });

  it('does not reload when resolved target equals base config actor', () => {
    const inf = { ...emptyInf, actorHandle: 'default' };
    const { config } = resolveActor({}, inf, baseConfig);
    // target === baseConfig.actor, so the base config is reused as-is
    expect(config).toBe(baseConfig);
  });

  it('reloads with the new actor when it differs from base config', () => {
    const { config } = resolveActor({ actor: 'other' }, emptyInf, baseConfig);
    expect(config.actor).toBe('other');
  });
});
