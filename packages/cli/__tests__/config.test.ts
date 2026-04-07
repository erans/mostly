import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadConfig,
  requireAuth,
  configExists,
  getConfigDir,
  getConfigPath,
  getDbPath,
} from '../src/config.js';
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
      expect(config.apiKey).toBeUndefined();
      expect(config.agentToken).toBeUndefined();
      expect(config.actor).toBeUndefined();
    });

    it('reads api_key, agent_token, and default_actor from config file', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({
          server_url: 'http://example.com:9090',
          api_key: 'msk_file',
          agent_token: 'mat_file',
          default_actor: 'file-actor',
        }),
      );

      const config = loadConfig();
      expect(config.serverUrl).toBe('http://example.com:9090');
      expect(config.apiKey).toBe('msk_file');
      expect(config.agentToken).toBe('mat_file');
      expect(config.actor).toBe('file-actor');
    });

    it('env vars override config file', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({
          server_url: 'http://file.com',
          api_key: 'msk_file',
          agent_token: 'mat_file',
          default_actor: 'file-actor',
        }),
      );

      vi.stubEnv('MOSTLY_SERVER_URL', 'http://env.com');
      vi.stubEnv('MOSTLY_API_KEY', 'msk_env');
      vi.stubEnv('MOSTLY_AGENT_TOKEN', 'mat_env');
      vi.stubEnv('MOSTLY_ACTOR', 'env-actor');

      const config = loadConfig();
      expect(config.serverUrl).toBe('http://env.com');
      expect(config.apiKey).toBe('msk_env');
      expect(config.agentToken).toBe('mat_env');
      expect(config.actor).toBe('env-actor');
    });

    it('CLI overrides take highest priority', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({
          server_url: 'http://file.com',
          api_key: 'msk_file',
          agent_token: 'mat_file',
          default_actor: 'file-actor',
        }),
      );

      vi.stubEnv('MOSTLY_SERVER_URL', 'http://env.com');
      vi.stubEnv('MOSTLY_API_KEY', 'msk_env');
      vi.stubEnv('MOSTLY_AGENT_TOKEN', 'mat_env');
      vi.stubEnv('MOSTLY_ACTOR', 'env-actor');

      const config = loadConfig({
        serverUrl: 'http://cli.com',
        apiKey: 'msk_cli',
        agentToken: 'mat_cli',
        actor: 'cli-actor',
      });
      expect(config.serverUrl).toBe('http://cli.com');
      expect(config.apiKey).toBe('msk_cli');
      expect(config.agentToken).toBe('mat_cli');
      expect(config.actor).toBe('cli-actor');
    });

    it('reads from env vars when no config file exists', () => {
      mockedExistsSync.mockReturnValue(false);

      vi.stubEnv('MOSTLY_SERVER_URL', 'http://env-only.com');
      vi.stubEnv('MOSTLY_API_KEY', 'msk_env-only');
      vi.stubEnv('MOSTLY_ACTOR', 'env-only-actor');

      const config = loadConfig();
      expect(config.serverUrl).toBe('http://env-only.com');
      expect(config.apiKey).toBe('msk_env-only');
      expect(config.actor).toBe('env-only-actor');
    });

    it('handles malformed config file gracefully', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('not valid json');

      const config = loadConfig();
      expect(config.serverUrl).toBe('http://localhost:6080');
      expect(config.apiKey).toBeUndefined();
      expect(config.agentToken).toBeUndefined();
      expect(config.actor).toBeUndefined();
    });

    it('handles a file config that is an array (not an object) gracefully', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(['not', 'an', 'object']));

      const config = loadConfig();
      expect(config.serverUrl).toBe('http://localhost:6080');
      expect(config.apiKey).toBeUndefined();
    });

    it('normalizes empty strings to undefined so api_key="" does not count as auth', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({ server_url: 'http://x', api_key: '', agent_token: '' }),
      );

      const config = loadConfig();
      expect(config.apiKey).toBeUndefined();
      expect(config.agentToken).toBeUndefined();
    });
  });

  describe('requireAuth', () => {
    it('throws when neither api_key nor agent_token is set', () => {
      mockedExistsSync.mockReturnValue(false);
      const config = loadConfig();
      expect(() => requireAuth(config)).toThrow(/Not authenticated/);
    });

    it('accepts a config with only api_key', () => {
      mockedExistsSync.mockReturnValue(false);
      vi.stubEnv('MOSTLY_API_KEY', 'msk_abc');
      const config = loadConfig();
      expect(() => requireAuth(config)).not.toThrow();
    });

    it('throws when agent_token is set without an actor', () => {
      mockedExistsSync.mockReturnValue(false);
      vi.stubEnv('MOSTLY_AGENT_TOKEN', 'mat_abc');
      const config = loadConfig();
      expect(() => requireAuth(config)).toThrow(/actor/);
    });

    it('accepts agent_token + actor', () => {
      mockedExistsSync.mockReturnValue(false);
      vi.stubEnv('MOSTLY_AGENT_TOKEN', 'mat_abc');
      vi.stubEnv('MOSTLY_ACTOR', 'bot');
      const config = loadConfig();
      expect(() => requireAuth(config)).not.toThrow();
    });

    it('api_key takes precedence — actor is not required if api_key is set', () => {
      mockedExistsSync.mockReturnValue(false);
      vi.stubEnv('MOSTLY_API_KEY', 'msk_abc');
      vi.stubEnv('MOSTLY_AGENT_TOKEN', 'mat_abc');
      // No MOSTLY_ACTOR
      const config = loadConfig();
      expect(() => requireAuth(config)).not.toThrow();
    });
  });
});
