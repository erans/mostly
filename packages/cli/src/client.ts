import type { ResolvedConfig } from './config.js';

/**
 * How the client authenticates with the server.
 *
 * - `api_key`: human-level auth. Server resolves the actor from the API key,
 *   so the client does NOT inject `actor_handle` into mutation bodies.
 * - `agent_token`: shared workspace token. Server cannot know which agent
 *   sent the request, so the client MUST inject `actor_handle` on mutations.
 */
export type AuthMode = 'api_key' | 'agent_token';

export interface ClientOptions {
  serverUrl: string;
  apiKey?: string;
  agentToken?: string;
  actor?: string;
}

export class MostlyClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly actor?: string;
  private readonly mode: AuthMode;

  constructor(options: ClientOptions) {
    // Strip trailing slash
    this.baseUrl = options.serverUrl.replace(/\/+$/, '');

    // api_key wins over agent_token when both are present. This matches the
    // server's auth middleware ordering and the design spec's CLI rule.
    if (options.apiKey) {
      this.token = options.apiKey;
      this.mode = 'api_key';
      this.actor = undefined;
    } else if (options.agentToken) {
      this.token = options.agentToken;
      this.mode = 'agent_token';
      this.actor = options.actor;
    } else {
      throw new Error(
        'MostlyClient requires an apiKey or agentToken. ' +
          'Call requireAuth(config) before constructing the client.',
      );
    }
  }

  /**
   * Convenience constructor that accepts a ResolvedConfig. The caller is
   * expected to have already run requireAuth(config) so the resolution
   * is guaranteed to succeed.
   */
  static fromConfig(config: ResolvedConfig): MostlyClient {
    return new MostlyClient({
      serverUrl: config.serverUrl,
      apiKey: config.apiKey,
      agentToken: config.agentToken,
      actor: config.actor,
    });
  }

  getAuthMode(): AuthMode {
    return this.mode;
  }

  async get(path: string, params?: Record<string, string>): Promise<any> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }
    const res = await fetch(url, { method: 'GET', headers: this.headers() });
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

  async delete(path: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    return this.handleResponse(res);
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
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
      const error: any = new Error(message);
      error.status = res.status;
      throw error;
    }

    if (res.status === 204) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (/^application\/([a-z0-9_.+-]+\+)?json(\s*;|$)/i.test(contentType)) {
      return res.json();
    }
    return null;
  }
}
