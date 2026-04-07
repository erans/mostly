import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Principal, RegisterRequest } from '@mostly/types';
import * as authApi from '@/api/auth';
import { ApiError } from '@/api/client';

interface AuthState {
  user: Principal | null;
  /**
   * True only while the initial bootstrap (`getMe` on mount) is in flight.
   * Does NOT toggle for `login`/`register`/`logout`/`refreshUser` — callers
   * who need per-action loading state should track it locally on the form.
   */
  bootstrapping: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (handle: string, password: string) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // Map known server error codes to friendlier user-facing copy. The
    // canonical codes come from `packages/types/src/errors.ts`. The auth
    // service uses `UnauthorizedError` for bad-credentials/disabled-account
    // (login) and `ConflictError` for handle collisions (register), with
    // `NotFoundError` and `ForbiddenError` covering the remaining
    // user-actionable cases.
    if (err.code === 'unauthorized') return 'Incorrect handle or password.';
    if (err.code === 'conflict') return 'That handle is already taken.';
    if (err.code === 'forbidden') return 'Registration is closed. Ask an admin for an invite.';
    if (err.code === 'not_found') return 'No account with that handle.';
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

/**
 * AuthProvider — owns the current user, bootstraps from the server cookie
 * on mount, and exposes login/register/logout/refresh actions via context.
 *
 * PRECONDITION: callers MUST call `setBaseUrl(serverUrl)` from
 * `@/api/client` BEFORE mounting `<AuthProvider>`. The bootstrap effect
 * fires `getMe` synchronously after mount, which calls `apiFetch` →
 * `getBaseUrl()` and throws if no base URL is configured. The bootstrap
 * swallows that throw (it cannot tell a misconfiguration from a 401), so
 * a missing `setBaseUrl` silently drops the user into "not signed in"
 * with no diagnostic. Don't let that happen — wire `setBaseUrl` first.
 *
 * `refreshUser` THROWS on failure and leaves the existing user state
 * untouched. A transient `getMe` failure should not silently log the user
 * out — callers decide how to recover (e.g. accept-invite falls back to
 * navigating to /login on a post-success refresh failure).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Principal | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial bootstrap: try to fetch the current user on mount. A 401 (or
  // any failure) just means "not logged in yet" — that's a normal state
  // and should NOT surface as an error.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authApi.getMe();
        if (!cancelled) setUser(res.data);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (handle: string, password: string) => {
    setError(null);
    try {
      const res = await authApi.login({ handle, password });
      setUser(res.data);
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  }, []);

  const register = useCallback(async (req: RegisterRequest) => {
    setError(null);
    try {
      const res = await authApi.register(req);
      setUser(res.data);
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    try {
      await authApi.logout();
    } catch {
      // Even if the server call fails, drop the local user — the cookie
      // may already be invalid and there is nothing the user can do about
      // a server-side hiccup at logout time.
    } finally {
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    setError(null);
    const res = await authApi.getMe();
    setUser(res.data);
  }, []);

  const value: AuthContextValue = {
    user,
    bootstrapping,
    error,
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
