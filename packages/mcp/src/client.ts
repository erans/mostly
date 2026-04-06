import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface MostlyConfig {
  server_url: string;
  token: string;
  default_actor?: string;
}

function loadConfig(): MostlyConfig {
  // Env vars take precedence
  const serverUrl = process.env.MOSTLY_SERVER_URL;
  const token = process.env.MOSTLY_TOKEN;
  if (serverUrl && token) {
    return {
      server_url: serverUrl,
      token,
      default_actor: process.env.MOSTLY_ACTOR,
    };
  }

  const configPath = join(homedir(), '.mostly', 'config');
  if (!existsSync(configPath)) {
    throw new Error('Config not found. Run "mostly init" first, or set MOSTLY_SERVER_URL and MOSTLY_TOKEN env vars.');
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

export class MostlyMcpClient {
  private baseUrl: string;
  private token: string;
  private actor: string;

  constructor(config: MostlyConfig) {
    this.baseUrl = (config.server_url ?? 'http://localhost:6080').replace(/\/+$/, '');
    this.token = config.token;
    this.actor = config.default_actor ?? '';
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

  private injectActor(body: Record<string, unknown>): Record<string, unknown> {
    if (this.actor && !body.actor_handle) {
      return { ...body, actor_handle: this.actor };
    }
    return body;
  }

  private async handleResponse(res: Response): Promise<any> {
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        if (err.error) message = err.error;
        else if (err.message) message = err.message;
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
