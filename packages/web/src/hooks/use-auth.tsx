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
  loading: boolean;
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
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Principal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bootstrap: try to fetch the current user on mount. A 401 (or any
  // failure) just means "not logged in yet" — that's a normal state and
  // should NOT surface as an error.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await authApi.getMe();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (handle: string, password: string) => {
    setError(null);
    try {
      const principal = await authApi.login({ handle, password });
      setUser(principal);
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  }, []);

  const register = useCallback(async (req: RegisterRequest) => {
    setError(null);
    try {
      const principal = await authApi.register(req);
      setUser(principal);
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
    try {
      const me = await authApi.getMe();
      setUser(me);
    } catch (err) {
      setUser(null);
      // Don't surface as an error — refresh is best-effort.
      void err;
    }
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
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
