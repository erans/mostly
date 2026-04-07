import { useState } from 'react';
import { useConfig } from '@/hooks/use-config';
import { setBaseUrl } from '@/api/client';

export function SetupScreen() {
  const { setConfig } = useConfig();
  const [serverUrl, setServerUrl] = useState('http://localhost:6080');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const trimmed = serverUrl.replace(/\/+$/, '');
      // Probe the unauthenticated health endpoint to verify the server is
      // reachable. We hit /healthz directly (not via apiFetch) because the
      // health check is mounted outside /v0/* and does not need cookies.
      const res = await fetch(`${trimmed}/healthz`);
      if (!res.ok) {
        throw new Error(`Server responded with HTTP ${res.status}`);
      }
      // Imperative call required: setConfig triggers a re-render that mounts
      // routes whose query hooks call apiFetch immediately, which needs the
      // base URL configured before the first request fires.
      setBaseUrl(trimmed);
      setConfig({ serverUrl: trimmed });
    } catch (err) {
      if (err instanceof TypeError) {
        // Browser fetch surfaces network/CORS/cert failures as TypeError
        // ("Failed to fetch"), which is opaque on its own.
        setError(`Could not reach ${serverUrl} — check the URL and that the server is running.`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Connection failed');
      }
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
