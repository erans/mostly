import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractSessionCookie, defaultKeyName } from '../src/commands/login.js';
import { deriveAcceptUrl } from '../src/commands/invite.js';

// `os.hostname` is imported inside login.ts, so mock the module.
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, hostname: vi.fn(() => 'mybox.local') };
});
import { hostname } from 'os';
const mockedHostname = vi.mocked(hostname);

describe('login helpers', () => {
  describe('extractSessionCookie', () => {
    it('returns null when no header is present', () => {
      expect(extractSessionCookie(null)).toBeNull();
    });

    it('returns null when the header does not contain mostly_session', () => {
      expect(extractSessionCookie('other=x; Path=/')).toBeNull();
    });

    it('parses a single Set-Cookie header', () => {
      expect(
        extractSessionCookie(
          'mostly_session=abc123; Path=/; HttpOnly; SameSite=Lax',
        ),
      ).toBe('abc123');
    });

    it('parses when multiple Set-Cookie headers are comma-concatenated', () => {
      // Node fetch concatenates multiple Set-Cookie headers with `, `.
      const header =
        'other=1; Path=/, mostly_session=sess_xyz; Path=/; HttpOnly, third=2';
      expect(extractSessionCookie(header)).toBe('sess_xyz');
    });

    it('stops at whitespace or comma so adjacent cookies do not leak in', () => {
      expect(
        extractSessionCookie('mostly_session=abc; next=y'),
      ).toBe('abc');
    });

    it('returns null when the value is empty', () => {
      expect(extractSessionCookie('mostly_session=; Path=/')).toBeNull();
    });
  });

  describe('defaultKeyName', () => {
    beforeEach(() => {
      mockedHostname.mockReset();
    });
    afterEach(() => {
      mockedHostname.mockReset();
    });

    it('returns cli-<hostname> for a simple lowercase hostname', () => {
      mockedHostname.mockReturnValue('mybox');
      expect(defaultKeyName()).toBe('cli-mybox');
    });

    it('lowercases the hostname', () => {
      mockedHostname.mockReturnValue('MyBox');
      expect(defaultKeyName()).toBe('cli-mybox');
    });

    it('replaces dots and other disallowed characters with dashes', () => {
      mockedHostname.mockReturnValue('mybox.local');
      expect(defaultKeyName()).toBe('cli-mybox-local');
    });

    it('strips leading/trailing dashes after replacement', () => {
      mockedHostname.mockReturnValue('.host.');
      expect(defaultKeyName()).toBe('cli-host');
    });

    it('falls back to cli-local when hostname resolves to a symbol-only string', () => {
      mockedHostname.mockReturnValue('...');
      expect(defaultKeyName()).toBe('cli-local');
    });

    it('falls back to cli-local for an empty hostname', () => {
      mockedHostname.mockReturnValue('');
      expect(defaultKeyName()).toBe('cli-local');
    });
  });
});

describe('invite helpers', () => {
  describe('deriveAcceptUrl', () => {
    it('strips the /v0 path from a typical server URL', () => {
      expect(deriveAcceptUrl('http://localhost:6080/v0', 'tok')).toBe(
        'http://localhost:6080/invite/tok',
      );
    });

    it('strips a trailing slash', () => {
      expect(deriveAcceptUrl('http://localhost:6080/', 'tok')).toBe(
        'http://localhost:6080/invite/tok',
      );
    });

    it('preserves the hostname and port', () => {
      expect(deriveAcceptUrl('https://mostly.example.com:8443/v0', 'tok')).toBe(
        'https://mostly.example.com:8443/invite/tok',
      );
    });

    it('drops query and fragment', () => {
      expect(
        deriveAcceptUrl('http://localhost:6080/v0?debug=1#frag', 'tok'),
      ).toBe('http://localhost:6080/invite/tok');
    });

    it('falls back for a non-URL string', () => {
      expect(deriveAcceptUrl('not a url', 'tok')).toBe('not a url/invite/tok');
    });
  });
});
