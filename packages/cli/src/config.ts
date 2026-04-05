import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface MostlyConfig {
  server_url: string;
  token: string;
  default_actor?: string;
}

export interface ResolvedConfig {
  serverUrl: string;
  token: string;
  actor: string;
}

const DEFAULT_SERVER_URL = 'http://localhost:6080';

export function getConfigDir(): string {
  return join(homedir(), '.mostly');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config');
}

export function getDbPath(): string {
  return join(getConfigDir(), 'mostly.db');
}

export function configExists(): boolean {
  return existsSync(getConfigPath());
}

function readConfigFile(): Partial<MostlyConfig> {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Resolve config with priority: CLI flags > env vars > config file > defaults.
 */
export function loadConfig(overrides?: {
  actor?: string;
  serverUrl?: string;
  token?: string;
}): ResolvedConfig {
  const file = readConfigFile();

  const serverUrl =
    overrides?.serverUrl ??
    process.env.MOSTLY_SERVER_URL ??
    file.server_url ??
    DEFAULT_SERVER_URL;

  const token =
    overrides?.token ??
    process.env.MOSTLY_TOKEN ??
    file.token ??
    '';

  const actor =
    overrides?.actor ??
    process.env.MOSTLY_ACTOR ??
    file.default_actor ??
    '';

  return { serverUrl, token, actor };
}
