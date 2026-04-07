import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/use-auth';

const HANDLE_PATTERN = /^[a-z0-9_-]+$/;

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, error } = useAuth();

  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // formError is for client-side validation; it takes precedence over the
  // server error from useAuth() because it represents the most recent action.
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Mirror the server schema (`packages/types/src/auth.ts`
    // `RegisterRequest`) so we fail fast and don't burn a network round-trip
    // on obviously bad input.
    if (!HANDLE_PATTERN.test(handle) || handle.length > 64) {
      setFormError('Handle must be lowercase letters, numbers, hyphens, or underscores.');
      return;
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }

    const trimmedDisplayName = displayName.trim();

    setSubmitting(true);
    try {
      await register({
        handle,
        password,
        display_name: trimmedDisplayName || undefined,
      });
      navigate('/');
    } catch {
      // register() populated useAuth().error; the form re-renders to show it.
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = submitting || !handle || !password;
  const displayedError = formError || error;

  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6"
      >
        <h1 className="text-lg font-bold text-text">Create your account</h1>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">
            Handle <span className="text-text-muted">(lowercase letters, numbers, - or _)</span>
          </span>
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
            minLength={8}
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Display name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Optional"
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </label>

        {displayedError && <p className="text-sm text-status-blocked">{displayedError}</p>}

        <button
          type="submit"
          disabled={disabled}
          className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Creating account...' : 'Create account'}
        </button>

        <p className="text-center text-xs text-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
