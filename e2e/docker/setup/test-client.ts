const SERVER_URL = process.env.MOSTLY_SERVER_URL ?? process.env.SERVER_URL ?? 'http://localhost:6080';
const TOKEN = process.env.MOSTLY_TOKEN ?? 'test-token-e2e';

export interface ApiResponse<T = any> {
  status: number;
  data: T;
  meta?: any;
  error?: { code: string; message: string };
}

class TestClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  private headers(auth: boolean = true): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  async get(path: string, opts?: { auth?: boolean; params?: Record<string, string> }): Promise<ApiResponse> {
    let url = `${this.baseUrl}${path}`;
    if (opts?.params) {
      const qs = new URLSearchParams(opts.params).toString();
      if (qs) url += `?${qs}`;
    }
    const res = await fetch(url, {
      method: 'GET',
      headers: this.headers(opts?.auth ?? true),
    });
    return this.parse(res);
  }

  async post(path: string, body: Record<string, unknown>, opts?: { auth?: boolean }): Promise<ApiResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(opts?.auth ?? true),
      body: JSON.stringify(body),
    });
    return this.parse(res);
  }

  async patch(path: string, body: Record<string, unknown>): Promise<ApiResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return this.parse(res);
  }

  async healthz(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async parse(res: Response): Promise<ApiResponse> {
    const contentType = res.headers.get('content-type') ?? '';
    if (/json/i.test(contentType)) {
      const json = await res.json() as any;
      return {
        status: res.status,
        data: json.data,
        meta: json.meta,
        error: json.error,
      };
    }
    return { status: res.status, data: null };
  }
}

export const client = new TestClient(SERVER_URL, TOKEN);

export function clientWithToken(token: string): TestClient {
  return new TestClient(SERVER_URL, token);
}

export { SERVER_URL, TOKEN };
