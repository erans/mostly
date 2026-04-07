import { useState } from 'react';
import { useConfig } from '@/hooks/use-config';
import { setClientConfig, apiFetch } from '@/api/client';

export function SetupScreen() {
  const { setConfig } = useConfig();
  const [serverUrl, setServerUrl] = useState('http://localhost:6080');
  const [token, setToken] = useState('');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      setClientConfig({ baseUrl: serverUrl, token });
      // Validate by fetching the principal
      await apiFetch(`/v0/principals/${encodeURIComponent(handle)}`);
      setConfig({ serverUrl, token, principalHandle: handle });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6"
      >
        <h1 className="text-lg font-bold text-text">Welcome to Mostly</h1>
        <p className="text-sm text-text-secondary">Connect to your Mostly server to get started.</p>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Server URL</span>
          <input
            type="url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">API Token</span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            placeholder="Bearer token"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Your Handle</span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            placeholder="e.g. eran"
            required
          />
        </label>

        {error && <p className="text-sm text-status-blocked">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </form>
    </div>
  );
}
