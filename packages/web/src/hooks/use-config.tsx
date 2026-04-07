import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface AppConfig {
  serverUrl: string;
}

interface ConfigContextValue {
  config: AppConfig | null;
  setConfig: (config: AppConfig) => void;
  clearConfig: () => void;
}

const STORAGE_KEY = 'mostly-config';

function loadConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Reject any stale shape from the previous (token + handle) version of
    // this hook. The session now lives in an HttpOnly cookie, so the only
    // thing we still persist client-side is the server URL.
    if (parsed && typeof parsed.serverUrl === 'string' && parsed.serverUrl.length > 0) {
      return { serverUrl: parsed.serverUrl };
    }
    return null;
  } catch {
    return null;
  }
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<AppConfig | null>(loadConfig);

  const setConfig = useCallback((c: AppConfig) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    setConfigState(c);
  }, []);

  const clearConfig = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setConfigState(null);
  }, []);

  return (
    <ConfigContext.Provider value={{ config, setConfig, clearConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider');
  return ctx;
}
