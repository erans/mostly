import { useRef, useState } from 'react';
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
  // Hide stale errors when the user starts typing again.
  const [errorVisible, setErrorVisible] = useState(false);
  // useRef guard against double-submit (see login.tsx for rationale).
  const submittingRef = useRef(false);

  // Derived match state — drives aria-invalid on both password inputs so
  // assistive tech announces the mismatch. We treat an empty confirm field
  // as "not yet mismatched" so the user isn't yelled at while typing.
  const passwordsMatch = password === confirmPassword || confirmPassword.length === 0;

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
    if (submittingRef.current) return;
    setFormError(null);
    setErrorVisible(true);

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      // accept-invite isn't in `api/auth.ts` because it's a one-time flow that
      // doesn't belong on the standard auth surface; call apiFetch directly.
      // The server sets the session cookie on success, so we then refresh the
      // auth context to pick up the new principal before navigating home.
      // Explicit <unknown> matches the convention elsewhere in the codebase
      // and makes the discarded-response intent clear.
      await apiFetch<unknown>('/v0/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      try {
        await refreshUser();
        navigate('/');
      } catch {
        // The invite was accepted (cookie set) but the follow-up /me probe
        // failed. Send the user to login — they can sign in with the password
        // they just set.
        navigate('/login');
      }
    } catch (err) {
      setFormError(acceptInviteErrorMessage(err));
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
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
            onChange={(e) => {
              setPassword(e.target.value);
              setErrorVisible(false);
            }}
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            aria-invalid={!passwordsMatch}
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Confirm password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setErrorVisible(false);
            }}
            autoComplete="new-password"
            maxLength={128}
            aria-invalid={!passwordsMatch}
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            required
          />
        </label>

        {errorVisible && formError && (
          <p role="alert" className="text-sm text-status-blocked">
            {formError}
          </p>
        )}

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
