import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadConfig,
  requireAuth,
  configExists,
  getConfigDir,
  getConfigPath,
  getDbPath,
  readConfig,
  writeConfig,
  updateConfig,
} from '../src/config.js';
import { homedir } from 'os';
import { join } from 'path';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
}));

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';

const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedRenameSync = vi.mocked(renameSync);

describe('config', () => {
  const home = homedir();

  beforeEach(() => {
    vi.unstubAllEnvs();
    mockedExistsSync.mockReset();
    mockedMkdirSync.mockReset();
    mockedReadFileSync.mockReset();
    mockedWriteFileSync.mockReset();
    mockedRenameSync.mockReset();
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

  describe('readConfig', () => {
    it('returns empty object when config file does not exist', () => {
      mockedExistsSync.mockReturnValue(false);
      expect(readConfig()).toEqual({});
    });

    it('returns parsed config when file exists', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({
          server_url: 'http://example.com',
          api_key: 'msk_abc',
          default_actor: 'alice',
        }),
      );
      expect(readConfig()).toEqual({
        server_url: 'http://example.com',
        api_key: 'msk_abc',
        default_actor: 'alice',
      });
    });

    it('returns empty object when file contents are not an object', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(['not', 'an', 'object']));
      expect(readConfig()).toEqual({});
    });

    it('returns empty object when file contents are malformed JSON', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('{ not valid');
      expect(readConfig()).toEqual({});
    });
  });

  describe('writeConfig', () => {
    it('creates the config directory when it does not exist', () => {
      // Dir missing, then tmp doesn't matter
      mockedExistsSync.mockReturnValue(false);

      writeConfig({ server_url: 'http://x' });

      expect(mockedMkdirSync).toHaveBeenCalledWith(join(home, '.mostly'), { recursive: true });
    });

    it('does not create the config directory when it already exists', () => {
      mockedExistsSync.mockReturnValue(true);

      writeConfig({ server_url: 'http://x' });

      expect(mockedMkdirSync).not.toHaveBeenCalled();
    });

    it('writes atomically via tmp file + rename with mode 0600', () => {
      mockedExistsSync.mockReturnValue(true);

      writeConfig({ server_url: 'http://x', api_key: 'msk_abc' });

      const finalPath = join(home, '.mostly', 'config');
      const tmpPath = `${finalPath}.tmp`;

      expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
      const [writePath, writeBody, writeOpts] = mockedWriteFileSync.mock.calls[0];
      expect(writePath).toBe(tmpPath);
      expect(writeOpts).toEqual({ mode: 0o600 });

      // Body is JSON with a trailing newline
      expect(typeof writeBody).toBe('string');
      const parsed = JSON.parse(writeBody as string);
      expect(parsed).toEqual({ server_url: 'http://x', api_key: 'msk_abc' });
      expect((writeBody as string).endsWith('\n')).toBe(true);

      expect(mockedRenameSync).toHaveBeenCalledWith(tmpPath, finalPath);
    });

    it('strips undefined fields from the serialized JSON', () => {
      mockedExistsSync.mockReturnValue(true);

      writeConfig({
        server_url: 'http://x',
        api_key: undefined,
        agent_token: undefined,
        default_actor: 'alice',
      });

      const body = mockedWriteFileSync.mock.calls[0][1] as string;
      const parsed = JSON.parse(body);
      expect(parsed).toEqual({ server_url: 'http://x', default_actor: 'alice' });
      expect(parsed).not.toHaveProperty('api_key');
      expect(parsed).not.toHaveProperty('agent_token');
    });
  });

  describe('updateConfig', () => {
    it('merges updates into the existing config', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({
          server_url: 'http://old.com',
          agent_token: 'mat_existing',
          default_actor: 'alice',
        }),
      );

      updateConfig({ api_key: 'msk_new' });

      const body = mockedWriteFileSync.mock.calls[0][1] as string;
      const parsed = JSON.parse(body);
      expect(parsed).toEqual({
        server_url: 'http://old.com',
        agent_token: 'mat_existing',
        default_actor: 'alice',
        api_key: 'msk_new',
      });
    });

    it('overwrites an existing field when a new value is provided', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({ server_url: 'http://old.com', api_key: 'msk_old' }),
      );

      updateConfig({ api_key: 'msk_new' });

      const body = mockedWriteFileSync.mock.calls[0][1] as string;
      const parsed = JSON.parse(body);
      expect(parsed.api_key).toBe('msk_new');
      expect(parsed.server_url).toBe('http://old.com');
    });

    it('removes a field when passed null', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({
          server_url: 'http://x',
          api_key: 'msk_abc',
          default_actor: 'alice',
        }),
      );

      updateConfig({ api_key: null });

      const body = mockedWriteFileSync.mock.calls[0][1] as string;
      const parsed = JSON.parse(body);
      expect(parsed).not.toHaveProperty('api_key');
      expect(parsed.server_url).toBe('http://x');
      expect(parsed.default_actor).toBe('alice');
    });

    it('leaves unrelated fields untouched when a key is undefined', () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({ server_url: 'http://x', api_key: 'msk_abc' }),
      );

      updateConfig({ default_actor: 'bob' });

      const body = mockedWriteFileSync.mock.calls[0][1] as string;
      const parsed = JSON.parse(body);
      expect(parsed).toEqual({
        server_url: 'http://x',
        api_key: 'msk_abc',
        default_actor: 'bob',
      });
    });

    it('starts from an empty object when the existing config is missing', () => {
      mockedExistsSync.mockReturnValue(false);

      updateConfig({ api_key: 'msk_new', default_actor: 'alice' });

      const body = mockedWriteFileSync.mock.calls[0][1] as string;
      const parsed = JSON.parse(body);
      expect(parsed).toEqual({ api_key: 'msk_new', default_actor: 'alice' });
    });
  });
});
