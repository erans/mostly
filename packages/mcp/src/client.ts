import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * On-disk config file shape. Mirrors `packages/cli/src/config.ts` so that the
 * MCP server reads the same `~/.mostly/config` the CLI writes during `mostly
 * init` / `mostly login`. All auth fields are optional because a config may be
 * in any of the agent-token-only or api-key states.
 */
export interface MostlyConfig {
  server_url?: string;
  api_key?: string;
  agent_token?: string;
  default_actor?: string;
}

/**
 * How the client authenticates with the server. Mirrors `packages/cli/src/client.ts`.
 *
 * - `api_key`: human-level auth. Server resolves the actor from the API key,
 *   so the client does NOT inject `actor_handle` into mutation bodies.
 * - `agent_token`: shared workspace token. Server cannot know which agent
 *   sent the request, so the client MUST inject `actor_handle` on mutations.
 */
type AuthMode = 'api_key' | 'agent_token';

const DEFAULT_SERVER_URL = 'http://localhost:6080';

/**
 * Resolve config with env-vars overriding the file. Matches the CLI's
 * resolution: env vars override file, file overrides defaults; `api_key`
 * takes precedence over `agent_token` when both are present (handled by the
 * client constructor below). Throws if neither auth credential is set.
 */
function loadConfig(): MostlyConfig {
  const configPath = join(homedir(), '.mostly', 'config');
  const fileConfig: Partial<MostlyConfig> = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, 'utf-8'))
    : {};

  const server_url =
    process.env.MOSTLY_SERVER_URL ?? fileConfig.server_url ?? DEFAULT_SERVER_URL;
  const api_key = process.env.MOSTLY_API_KEY ?? fileConfig.api_key;
  const agent_token = process.env.MOSTLY_AGENT_TOKEN ?? fileConfig.agent_token;
  const default_actor = process.env.MOSTLY_ACTOR ?? fileConfig.default_actor;

  if (!api_key && !agent_token) {
    throw new Error(
      'Not authenticated. Run "mostly init" to set up, or set MOSTLY_SERVER_URL and MOSTLY_API_KEY (or MOSTLY_AGENT_TOKEN) env vars.',
    );
  }

  return {
    server_url,
    api_key: api_key || undefined,
    agent_token: agent_token || undefined,
    default_actor: default_actor || undefined,
  };
}

export class MostlyMcpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly mode: AuthMode;
  private readonly actor?: string;

  constructor(config: MostlyConfig) {
    this.baseUrl = (config.server_url ?? DEFAULT_SERVER_URL).replace(/\/+$/, '');

    // api_key wins over agent_token when both are present, matching the
    // server's auth middleware ordering and the CLI client.
    if (config.api_key) {
      this.token = config.api_key;
      this.mode = 'api_key';
      this.actor = undefined;
    } else if (config.agent_token) {
      // Agent-token mutations require an actor — the server cannot infer one
      // from a shared token. Fail loud here rather than producing 400s later.
      if (!config.default_actor) {
        throw new Error(
          'Agent-token authentication requires an actor. Set `default_actor` in ~/.mostly/config or MOSTLY_ACTOR env var.',
        );
      }
      this.token = config.agent_token;
      this.mode = 'agent_token';
      this.actor = config.default_actor;
    } else {
      throw new Error(
        'MostlyMcpClient requires an api_key or agent_token. Run "mostly init" or set MOSTLY_API_KEY / MOSTLY_AGENT_TOKEN.',
      );
    }
  }

  async get(path: string, params?: Record<string, string>): Promise<any> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: this.headers(),
    });

    return this.handleResponse(res);
  }

  async post(path: string, body: Record<string, unknown>): Promise<any> {
    const payload = this.injectActor(body);
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return this.handleResponse(res);
  }

  async patch(path: string, body: Record<string, unknown>): Promise<any> {
    const payload = this.injectActor(body);
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return this.handleResponse(res);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }

  /**
   * Only inject actor_handle when authenticating as an agent. Under api_key
   * auth the server resolves the actor from the key, so injecting would be
   * ignored at best and misleading at worst.
   */
  private injectActor(body: Record<string, unknown>): Record<string, unknown> {
    if (this.mode !== 'agent_token') return body;
    if (!this.actor || body.actor_handle || body.actor_id) return body;
    return { ...body, actor_handle: this.actor };
  }

  private async handleResponse(res: Response): Promise<any> {
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        if (err.error) {
          message = typeof err.error === 'string' ? err.error : (err.error.message ?? message);
        } else if (err.message) {
          message = err.message;
        }
      } catch {
        // Use default message
      }
      throw new Error(message);
    }

    if (res.status === 204) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (/^application\/([a-z0-9_.+-]+\+)?json(\s*;|$)/i.test(contentType)) {
      return res.json();
    }
    return null;
  }
}

export { loadConfig };
