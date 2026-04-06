import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig, configExists, getConfigDir, getConfigPath, getDbPath } from '../src/config.js';
import { homedir } from 'os';
import { join } from 'path';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from 'fs';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);

describe('config', () => {
  const home = homedir();

  beforeEach(() => {
    vi.unstubAllEnvs();
    mockedExistsSync.mockReset();
    mockedReadFileSync.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getConfigDir', () => {
    it('returns ~/.mostly', () => {
      expect(getConfigDir()).toBe(join(home, '.mostly'));
    });
  });

  describe('getConfigPath', () => {
    it('returns ~/.mostly/config', () => {
      expect(getConfigPath()).toBe(join(home, '.mostly', 'config'));
    });
  });

  describe('getDbPath', () => {
    it('returns ~/.mostly/mostly.db', () => {
      expect(getDbPath()).toBe(join(home, '.mostly', 'mostly.db'));
    });
  });

  describe('configExists', () => {
    it('returns false when config file does not exist', () => {
      mockedExistsSync.mockReturnValue(false);
      expect(configExists()).toBe(false);
    });

    it('returns true when config file exists', () => {
      mockedExistsSync.mockReturnValue(true);
      expect(configExists()).toBe(true);
    });
  });

  describe('loadConfig', () => {
    it('falls back to defaults when no file and no env vars', () => {
      mockedExistsSync.mockReturnValue(false);

      const config = loadConfig();
      expect(config.serverUrl).toBe('http://localhost:6080');
      expect(config.token).toBe('');
      expect(config.actor).toBe('');
    });

    it('reads from config file', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify({
        server_url: 'http://example.com:9090',
        token: 'file-token',
        default_actor: 'file-actor',
      }));

      const config = loadConfig();
      expect(config.serverUrl).toBe('http://example.com:9090');
      expect(config.token).toBe('file-token');
      expect(config.actor).toBe('file-actor');
    });

    it('env vars override config file', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify({
        server_url: 'http://file.com',
        token: 'file-token',
        default_actor: 'file-actor',
      }));

      vi.stubEnv('MOSTLY_SERVER_URL', 'http://env.com');
      vi.stubEnv('MOSTLY_TOKEN', 'env-token');
      vi.stubEnv('MOSTLY_ACTOR', 'env-actor');

      const config = loadConfig();
      expect(config.serverUrl).toBe('http://env.com');
      expect(config.token).toBe('env-token');
      expect(config.actor).toBe('env-actor');
    });

    it('CLI overrides take highest priority', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify({
        server_url: 'http://file.com',
        token: 'file-token',
        default_actor: 'file-actor',
      }));

      vi.stubEnv('MOSTLY_SERVER_URL', 'http://env.com');
      vi.stubEnv('MOSTLY_TOKEN', 'env-token');
      vi.stubEnv('MOSTLY_ACTOR', 'env-actor');

      const config = loadConfig({
        serverUrl: 'http://cli.com',
        token: 'cli-token',
        actor: 'cli-actor',
      });
      expect(config.serverUrl).toBe('http://cli.com');
      expect(config.token).toBe('cli-token');
      expect(config.actor).toBe('cli-actor');
    });

    it('reads from env vars when no config file exists', () => {
      mockedExistsSync.mockReturnValue(false);

      vi.stubEnv('MOSTLY_SERVER_URL', 'http://env-only.com');
      vi.stubEnv('MOSTLY_TOKEN', 'env-only-token');
      vi.stubEnv('MOSTLY_ACTOR', 'env-only-actor');

      const config = loadConfig();
      expect(config.serverUrl).toBe('http://env-only.com');
      expect(config.token).toBe('env-only-token');
      expect(config.actor).toBe('env-only-actor');
    });

    it('handles malformed config file gracefully', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('not valid json');

      const config = loadConfig();
      expect(config.serverUrl).toBe('http://localhost:6080');
      expect(config.token).toBe('');
      expect(config.actor).toBe('');
    });
  });
});
