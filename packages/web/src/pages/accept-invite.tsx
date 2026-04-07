import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import { ApiError, apiFetch } from '@/api/client';

// Local copy of the friendly-error mapping. We deliberately don't import the
// helper from `use-auth.tsx` (it isn't exported, and accept-invite isn't part
// of the standard auth API surface — both `not_found` and `unauthorized`
// collapse to the same "invalid or expired" message because the server
// can't and shouldn't tell the user *which* failure mode they hit).
function acceptInviteErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'not_found' || err.code === 'unauthorized') {
      return 'This invite is invalid or has expired.';
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export function AcceptInvitePage() {
  const navigate = useNavigate();
  const { token } = useParams();
  const { refreshUser } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6">
          <h1 className="text-lg font-bold text-text">Accept your invite</h1>
          <p className="text-sm text-status-blocked">Invite token missing.</p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      // accept-invite isn't in `api/auth.ts` because it's a one-time flow that
      // doesn't belong on the standard auth surface; call apiFetch directly.
      // The server sets the session cookie on success, so we then refresh the
      // auth context to pick up the new principal before navigating home.
      await apiFetch('/v0/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      await refreshUser();
      navigate('/');
    } catch (err) {
      setFormError(acceptInviteErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const disabled =
    submitting || !password || !confirmPassword || password !== confirmPassword;

  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6"
      >
        <h1 className="text-lg font-bold text-text">Accept your invite</h1>
        <p className="text-sm text-text-secondary">
          You've been invited to join Mostly. Set a password to activate your account.
        </p>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Password</span>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Confirm password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            required
          />
        </label>

        {formError && <p className="text-sm text-status-blocked">{formError}</p>}

        <button
          type="submit"
          disabled={disabled}
          className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Activating...' : 'Accept invite'}
        </button>
      </form>
    </div>
  );
}
