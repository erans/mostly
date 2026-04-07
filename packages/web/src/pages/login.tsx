import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/use-auth';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, error } = useAuth();

  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  // Per-action loading state — useAuth().bootstrapping is for the initial
  // /me probe on mount and never toggles for login/register.
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(handle, password);
      navigate('/');
    } catch {
      // login() already populated useAuth().error with a friendly message;
      // the form re-renders to show it. Nothing else to do here.
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = submitting || !handle || !password;

  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6"
      >
        <h1 className="text-lg font-bold text-text">Sign in to Mostly</h1>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Handle</span>
          <input
            autoFocus
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            required
          />
        </label>

        {error && <p className="text-sm text-status-blocked">{error}</p>}

        <button
          type="submit"
          disabled={disabled}
          className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="text-center text-xs text-text-secondary">
          Don't have an account?{' '}
          <Link to="/register" className="text-accent hover:underline">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}
