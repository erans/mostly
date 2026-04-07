import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MostlyClient } from '../src/client.js';

describe('MostlyClient', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('throws if neither apiKey nor agentToken is provided', () => {
      expect(() => new MostlyClient({ serverUrl: 'http://x' })).toThrow(/apiKey or agentToken/);
    });

    it('uses api_key mode when apiKey is provided', () => {
      const c = new MostlyClient({ serverUrl: 'http://x', apiKey: 'msk_abc' });
      expect(c.getAuthMode()).toBe('api_key');
    });

    it('uses agent_token mode when only agentToken is provided', () => {
      const c = new MostlyClient({ serverUrl: 'http://x', agentToken: 'mat_abc', actor: 'bob' });
      expect(c.getAuthMode()).toBe('agent_token');
    });

    it('prefers api_key when both are provided', () => {
      const c = new MostlyClient({
        serverUrl: 'http://x',
        apiKey: 'msk_abc',
        agentToken: 'mat_abc',
        actor: 'bob',
      });
      expect(c.getAuthMode()).toBe('api_key');
    });

    it('strips trailing slash from serverUrl', async () => {
      const c = new MostlyClient({ serverUrl: 'http://x/', apiKey: 'msk_abc' });
      await c.get('/v0/ping');
      expect(fetchMock).toHaveBeenCalledWith('http://x/v0/ping', expect.any(Object));
    });
  });

  describe('Authorization header', () => {
    it('sends Bearer <apiKey> under api_key mode', async () => {
      const c = new MostlyClient({ serverUrl: 'http://x', apiKey: 'msk_abc' });
      await c.get('/v0/ping');
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBe('Bearer msk_abc');
    });

    it('sends Bearer <agentToken> under agent_token mode', async () => {
      const c = new MostlyClient({
        serverUrl: 'http://x',
        agentToken: 'mat_abc',
        actor: 'bob',
      });
      await c.get('/v0/ping');
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBe('Bearer mat_abc');
    });
  });

  describe('actor_handle injection', () => {
    it('does NOT inject actor_handle under api_key mode even when actor is set', async () => {
      const c = new MostlyClient({
        serverUrl: 'http://x',
        apiKey: 'msk_abc',
        actor: 'alice', // should be ignored
      });
      await c.post('/v0/tasks', { title: 'hi' });
      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body).toEqual({ title: 'hi' });
      expect(body.actor_handle).toBeUndefined();
    });

    it('injects actor_handle under agent_token mode', async () => {
      const c = new MostlyClient({
        serverUrl: 'http://x',
        agentToken: 'mat_abc',
        actor: 'bob',
      });
      await c.post('/v0/tasks', { title: 'hi' });
      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body).toEqual({ title: 'hi', actor_handle: 'bob' });
    });

    it('does not overwrite an explicit actor_handle in the body', async () => {
      const c = new MostlyClient({
        serverUrl: 'http://x',
        agentToken: 'mat_abc',
        actor: 'bob',
      });
      await c.post('/v0/tasks', { title: 'hi', actor_handle: 'override' });
      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.actor_handle).toBe('override');
    });

    it('does not inject actor_handle under agent_token mode if no actor is configured', async () => {
      const c = new MostlyClient({
        serverUrl: 'http://x',
        agentToken: 'mat_abc',
      });
      await c.post('/v0/tasks', { title: 'hi' });
      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.actor_handle).toBeUndefined();
    });
  });

  describe('handleResponse', () => {
    it('returns null for 204 No Content', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
      const c = new MostlyClient({ serverUrl: 'http://x', apiKey: 'msk_abc' });
      const result = await c.delete('/v0/api-keys/abc');
      expect(result).toBeNull();
    });

    it('throws on non-2xx with server error message', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Not authenticated' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const c = new MostlyClient({ serverUrl: 'http://x', apiKey: 'msk_abc' });
      await expect(c.get('/v0/me')).rejects.toThrow(/Not authenticated/);
    });

    it('throws a generic HTTP status message if body cannot be parsed', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('not json', { status: 500, headers: { 'content-type': 'text/plain' } }),
      );
      const c = new MostlyClient({ serverUrl: 'http://x', apiKey: 'msk_abc' });
      await expect(c.get('/v0/me')).rejects.toThrow(/HTTP 500/);
    });
  });

  describe('fromConfig', () => {
    it('constructs a client from a ResolvedConfig with apiKey', () => {
      const c = MostlyClient.fromConfig({
        serverUrl: 'http://x',
        apiKey: 'msk_abc',
        agentToken: undefined,
        actor: undefined,
      });
      expect(c.getAuthMode()).toBe('api_key');
    });

    it('constructs a client from a ResolvedConfig with agentToken + actor', () => {
      const c = MostlyClient.fromConfig({
        serverUrl: 'http://x',
        apiKey: undefined,
        agentToken: 'mat_abc',
        actor: 'bob',
      });
      expect(c.getAuthMode()).toBe('agent_token');
    });
  });
});
