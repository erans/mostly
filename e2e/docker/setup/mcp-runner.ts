import { spawn } from 'child_process';
import { resolve } from 'path';

const MCP_PATH = resolve(__dirname, '../../../packages/mcp/dist/index.js');
const SERVER_URL = process.env.MOSTLY_SERVER_URL ?? process.env.SERVER_URL ?? 'http://localhost:6080';
const TOKEN = process.env.MOSTLY_TOKEN ?? 'test-token-e2e';
const ACTOR = process.env.MOSTLY_ACTOR ?? 'e2e-agent';

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

export class McpTestRunner {
  private proc: ReturnType<typeof spawn> | null = null;
  private buffer = '';
  private pending = new Map<number, {
    resolve: (val: JsonRpcResponse) => void;
    reject: (err: Error) => void;
  }>();
  private nextId = 1;

  async start(): Promise<void> {
    this.proc = spawn('node', [MCP_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MOSTLY_SERVER_URL: SERVER_URL,
        MOSTLY_TOKEN: TOKEN,
        MOSTLY_ACTOR: ACTOR,
      },
    });

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.proc.stderr!.on('data', () => {
      // MCP servers log to stderr — ignore
    });

    await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e-test', version: '1.0.0' },
    });

    this.sendNotification('notifications/initialized', {});
  }

  async send(method: string, params?: any): Promise<any> {
    if (!this.proc) throw new Error('MCP server not started');
    const id = this.nextId++;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    this.proc.stdin!.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);

    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, 10000);

      this.pending.set(id, {
        resolve: (res) => {
          clearTimeout(timeout);
          if (res.error) reject(new Error(res.error.message));
          else resolve(res.result);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });
    });
  }

  sendNotification(method: string, params?: any): void {
    if (!this.proc) return;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
    this.proc.stdin!.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);
  }

  private processBuffer(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) { this.buffer = this.buffer.slice(headerEnd + 4); continue; }
      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + contentLength) break;
      const body = this.buffer.slice(bodyStart, bodyStart + contentLength);
      this.buffer = this.buffer.slice(bodyStart + contentLength);
      try {
        const response = JSON.parse(body) as JsonRpcResponse;
        if (response.id !== undefined && this.pending.has(response.id as number)) {
          const handler = this.pending.get(response.id as number)!;
          this.pending.delete(response.id as number);
          handler.resolve(response);
        }
      } catch { /* skip malformed */ }
    }
  }

  async stop(): Promise<void> {
    if (this.proc) { this.proc.kill(); this.proc = null; }
  }
}
