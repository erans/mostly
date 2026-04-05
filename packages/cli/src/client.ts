export class MostlyClient {
  private baseUrl: string;
  private token: string;
  private actor: string;

  constructor(baseUrl: string, token: string, actor: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
    this.actor = actor;
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
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return null;
  }
}
