import { useEffect, useRef, useState } from 'react';
import { Key, Trash2, Copy, Check } from 'lucide-react';
import type { ApiKey } from '@mostly/types';
import { Layout } from '@/components/layout';
import { ApiError } from '@/api/client';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/use-api-keys';

const NAME_PATTERN = /^[a-z0-9_-]+$/;
const NAME_MAX_LENGTH = 64;

interface PlaintextKey {
  id: string;
  name: string;
  key: string;
}

export function ApiKeysPage() {
  const { data: keys, isLoading, error: listError } = useApiKeys();
  const createMutation = useCreateApiKey();
  const revokeMutation = useRevokeApiKey();

  const [name, setName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [plaintextKey, setPlaintextKey] = useState<PlaintextKey | null>(null);
  const [copied, setCopied] = useState(false);

  // useRef double-submit guard: the disabled={...} check is racy because two
  // rapid clicks before React re-renders can both pass it. The ref flips
  // synchronously inside the handler.
  const submittingRef = useRef(false);

  // Reset the "Copied" check icon a moment after the user clicks copy.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  function validate(value: string): string | null {
    if (value.length < 1) return 'Name is required.';
    if (value.length > NAME_MAX_LENGTH) return `Name must be at most ${NAME_MAX_LENGTH} characters.`;
    if (!NAME_PATTERN.test(value)) {
      return 'Name must contain only lowercase letters, numbers, underscores, or hyphens.';
    }
    return null;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;

    const trimmed = name.trim();
    const validation = validate(trimmed);
    if (validation) {
      setValidationError(validation);
      return;
    }

    submittingRef.current = true;
    setValidationError(null);
    setCreateError(null);
    try {
      const res = await createMutation.mutateAsync({ name: trimmed });
      setPlaintextKey({ id: res.data.id, name: res.data.name, key: res.data.key });
      // Local state is now the canonical source for the plaintext key.
      // Clear the mutation cache immediately to minimize the exposure
      // window of the plaintext value living in React Query's internals.
      createMutation.reset();
      setName('');
      setCopied(false);
      // Clear any stale revoke error from a previous failed revoke; the
      // user has moved on to a new action.
      setRevokeError(null);
    } catch (err) {
      // Map server error codes to friendly messages. Inline rather than
      // importing a private helper from elsewhere — keeps this page
      // self-contained.
      if (err instanceof ApiError && err.code === 'conflict') {
        setCreateError('A key with that name already exists.');
      } else if (err instanceof Error) {
        setCreateError(err.message);
      } else {
        setCreateError('Failed to create API key.');
      }
    } finally {
      submittingRef.current = false;
    }
  }

  async function handleRevoke(key: ApiKey) {
    const ok = window.confirm(`Revoke "${key.name}"? This can't be undone.`);
    if (!ok) return;

    setRevokeError(null);
    try {
      await revokeMutation.mutateAsync(key.id);
      // If the revoked key is the same one we just minted, clear the
      // plaintext block too — it's no longer useful. Use a functional
      // setter so the comparison reads the latest state, not the value
      // captured when this handler was created.
      setPlaintextKey((prev) => (prev && prev.id === key.id ? null : prev));
    } catch (err) {
      if (err instanceof Error) {
        setRevokeError(err.message);
      } else {
        setRevokeError('Failed to revoke API key.');
      }
    }
  }

  async function handleCopy() {
    if (!plaintextKey) return;
    try {
      await navigator.clipboard.writeText(plaintextKey.key);
      setCopied(true);
    } catch {
      // Clipboard can fail in non-secure contexts; the user can still copy
      // manually from the visible text. Nothing actionable to surface here.
    }
  }

  const submitting = createMutation.isPending;
  const submitDisabled = submitting || name.trim().length === 0;

  return (
    <Layout onCommandPalette={() => {}}>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-text-secondary" aria-hidden="true" />
            <h1 className="text-lg font-bold text-text">API keys</h1>
          </div>
          <p className="text-sm text-text-secondary">
            API keys let you authenticate to the Mostly server from CLIs, scripts, and other
            tools. Each key is tied to your account.
          </p>
        </header>

        {/* Plaintext key shown after successful create. Persists until the
            user dismisses or creates another key. */}
        {plaintextKey && (
          <>
            {/* Screen-reader-only announcement: tells AT users a key was
                created without echoing the plaintext value aloud (which
                would leak it on shared/public hardware). The visual
                section below has no aria-live for the same reason. */}
            <p className="sr-only" aria-live="polite">
              API key "{plaintextKey.name}" created. Copy the key from the page before dismissing.
            </p>
            <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
              <h2 className="text-sm font-bold text-text">
                Save this key now — it won't be shown again
              </h2>
              <p className="text-xs text-text-secondary">
                Copy the key below and store it somewhere safe. You won't be able to view it
                again after you dismiss this message.
              </p>
              <div className="flex items-center gap-2 rounded border border-border bg-bg p-3">
                <code className="flex-1 break-all font-mono text-xs text-text">
                  {plaintextKey.key}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="Copy API key to clipboard"
                  className="shrink-0 rounded border border-border bg-surface p-2 text-text-secondary hover:opacity-90"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                  )}
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setPlaintextKey(null);
                    setCopied(false);
                    // Defense in depth: clear the mutation cache so the
                    // plaintext key cannot leak via React Query state
                    // even if handleCreate's reset() somehow missed.
                    createMutation.reset();
                  }}
                  className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  I saved it
                </button>
              </div>
            </section>
          </>
        )}

        {/* Create form */}
        <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-bold text-text">Create a new key</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setValidationError(null);
                  setCreateError(null);
                }}
                placeholder="my-laptop"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={NAME_MAX_LENGTH}
                aria-describedby="api-key-name-help"
                className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
              <span id="api-key-name-help" className="mt-1 block text-xs text-text-muted">
                Lowercase letters, numbers, underscores, or hyphens. 1–64 characters.
              </span>
            </label>

            {validationError && (
              <p role="alert" className="text-sm text-status-blocked">
                {validationError}
              </p>
            )}

            {createError && (
              <p role="alert" className="text-sm text-status-blocked">
                {createError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitDisabled}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create key'}
            </button>
          </form>
        </section>

        {/* List of existing keys */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-text">Your keys</h2>

          {revokeError && (
            <p
              role="alert"
              className="rounded border border-border bg-surface p-3 text-sm text-status-blocked"
            >
              {revokeError}
            </p>
          )}

          {isLoading ? (
            <div className="rounded-lg border border-border bg-surface p-4 text-sm text-text-muted">
              Loading...
            </div>
          ) : listError ? (
            <p
              role="alert"
              className="rounded-lg border border-border bg-surface p-4 text-sm text-status-blocked"
            >
              {listError instanceof Error ? listError.message : 'Failed to load API keys.'}
            </p>
          ) : !keys || keys.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-4 text-sm text-text-muted">
              No API keys yet.
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {keys.map((key) => (
                <li key={key.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-medium text-text">{key.name}</p>
                    <p className="font-mono text-xs text-text-secondary">
                      msk_{key.key_prefix}…
                    </p>
                    <p className="text-xs text-text-muted">Created {key.created_at}</p>
                    <p className="text-xs text-text-muted">
                      Last used {key.last_used_at ?? 'never'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevoke(key)}
                    disabled={revokeMutation.isPending}
                    aria-label={`Revoke ${key.name}`}
                    className="shrink-0 rounded border border-border bg-bg p-2 text-text-secondary hover:opacity-90 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
}
