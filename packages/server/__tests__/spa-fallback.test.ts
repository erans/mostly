import { describe, it, expect } from 'vitest';
import { isSpaFallbackPath } from '../src/serve.js';

describe('isSpaFallbackPath', () => {
  it('returns true for GET / (root)', () => {
    expect(isSpaFallbackPath('GET', '/')).toBe(true);
  });

  it('returns true for GET deep link', () => {
    expect(isSpaFallbackPath('GET', '/tasks/all')).toBe(true);
  });

  it('returns true for HEAD /', () => {
    expect(isSpaFallbackPath('HEAD', '/')).toBe(true);
  });

  it('returns false for POST /', () => {
    expect(isSpaFallbackPath('POST', '/')).toBe(false);
  });

  it('returns false for PUT /', () => {
    expect(isSpaFallbackPath('PUT', '/')).toBe(false);
  });

  it('returns false for DELETE /', () => {
    expect(isSpaFallbackPath('DELETE', '/')).toBe(false);
  });

  it('returns false for /v0 exact path', () => {
    expect(isSpaFallbackPath('GET', '/v0')).toBe(false);
  });

  it('returns false for /v0/ prefix', () => {
    expect(isSpaFallbackPath('GET', '/v0/tasks')).toBe(false);
  });

  it('returns false for /healthz', () => {
    expect(isSpaFallbackPath('GET', '/healthz')).toBe(false);
  });
});
