import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * On-disk config file shape. All auth-related fields are optional because
 * `mostly init` writes `agent_token` while `mostly login` adds `api_key`,
 * so a config may be in any of those states.
 */
export interface MostlyConfig {
  server_url?: string;
  api_key?: string;
  agent_token?: string;
  default_actor?: string;
}

/**
 * Resolved config passed around at runtime. Fields are normalized (camelCase)
 * and guaranteed to be consistent. `apiKey` takes precedence over `agentToken`
 * when both are present.
 */
export interface ResolvedConfig {
  serverUrl: string;
  apiKey?: string;
  agentToken?: string;
  /**
   * Actor handle for agent-token authentication. Ignored when apiKey is set
   * because the server resolves the actor from the API key.
   */
  actor?: string;
}

const DEFAULT_SERVER_URL = 'http://localhost:6080';

export function getConfigDir(): string {
  return join(homedir(), '.mostly');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config');
}

export function getDbPath(): string {
  return join(getConfigDir(), 'mostly.db');
}

export function configExists(): boolean {
  return existsSync(getConfigPath());
}

function readConfigFile(): MostlyConfig {
  const path = getConfigPath();
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    if (parsed && typeof parsed === 'object') return parsed as MostlyConfig;
    return {};
  } catch {
    return {};
  }
}

/**
 * Resolve config with priority: CLI overrides > env vars > config file > defaults.
 *
 * Env vars:
 *   MOSTLY_SERVER_URL    → server_url
 *   MOSTLY_API_KEY       → api_key
 *   MOSTLY_AGENT_TOKEN   → agent_token
 *   MOSTLY_ACTOR         → default_actor (only used with agent_token auth)
 */
export function loadConfig(overrides?: {
  serverUrl?: string;
  apiKey?: string;
  agentToken?: string;
  actor?: string;
}): ResolvedConfig {
  const file = readConfigFile();

  const serverUrl =
    overrides?.serverUrl ??
    process.env.MOSTLY_SERVER_URL ??
    file.server_url ??
    DEFAULT_SERVER_URL;

  const apiKey =
    overrides?.apiKey ??
    process.env.MOSTLY_API_KEY ??
    file.api_key ??
    undefined;

  const agentToken =
    overrides?.agentToken ??
    process.env.MOSTLY_AGENT_TOKEN ??
    file.agent_token ??
    undefined;

  const actor =
    overrides?.actor ??
    process.env.MOSTLY_ACTOR ??
    file.default_actor ??
    undefined;

  return {
    serverUrl,
    apiKey: apiKey || undefined,
    agentToken: agentToken || undefined,
    actor: actor || undefined,
  };
}

/**
 * Require either an API key or an agent token. Commands that need to hit the
 * server should call this; init/serve do not.
 */
export function requireAuth(config: ResolvedConfig): void {
  if (!config.apiKey && !config.agentToken) {
    throw new Error(
      'Not authenticated. Run `mostly init` to set up, or `mostly login` to sign in.',
    );
  }
  if (!config.apiKey && config.agentToken && !config.actor) {
    throw new Error(
      'Agent-token authentication requires an actor. Set `default_actor` in ' +
        `${getConfigPath()}, pass --actor <handle>, or run \`mostly login\` to use an API key.`,
    );
  }
}
