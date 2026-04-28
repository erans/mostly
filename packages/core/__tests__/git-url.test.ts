import { describe, expect, it } from 'vitest';
import { normalizeGitUrl } from '../src/git-url.js';

describe('normalizeGitUrl', () => {
  const cases: Array<[string, string]> = [
    ['git@github.com:acme/auth.git', 'github.com/acme/auth'],
    ['https://github.com/acme/auth.git', 'github.com/acme/auth'],
    ['https://github.com/acme/auth/', 'github.com/acme/auth'],
    ['http://github.com/acme/auth', 'github.com/acme/auth'],
    ['ssh://git@github.com/acme/auth.git', 'github.com/acme/auth'],
    ['ssh://git@github.com:22/acme/auth.git', 'github.com:22/acme/auth'],
    ['https://github.com:8443/acme/auth.git', 'github.com:8443/acme/auth'],
    ['git@GITHUB.COM:Acme/Auth.git', 'github.com/acme/auth'],
    ['https://user:pass@github.com/acme/auth.git', 'github.com/acme/auth'],
    ['https://github.com/acme/auth?ref=main', 'github.com/acme/auth'],
    ['https://github.com/acme/auth#frag', 'github.com/acme/auth'],
  ];

  it.each(cases)('normalizes %s', (input, expected) => {
    expect(normalizeGitUrl(input)).toBe(expected);
  });

  it('rejects empty', () => {
    expect(() => normalizeGitUrl('')).toThrow();
  });

  it('rejects non-url-shaped strings', () => {
    expect(() => normalizeGitUrl('not a url')).toThrow();
  });
});
