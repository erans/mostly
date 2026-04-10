import { describe, it, expect } from 'vitest';
import { shouldFallThroughToAssets } from '../src/worker.js';

describe('shouldFallThroughToAssets', () => {
  it('returns true for a 404 on a non-API path', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/dashboard');
    expect(shouldFallThroughToAssets(response, url)).toBe(true);
  });

  it('returns true for a 404 on the root path', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/');
    expect(shouldFallThroughToAssets(response, url)).toBe(true);
  });

  it('returns false for a 404 on an API path', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/v0/tasks/missing');
    expect(shouldFallThroughToAssets(response, url)).toBe(false);
  });

  it('returns false for a 200 response even on a non-API path', () => {
    const response = new Response('ok', { status: 200 });
    const url = new URL('https://example.com/dashboard');
    expect(shouldFallThroughToAssets(response, url)).toBe(false);
  });

  it('returns false for a 500 response on a non-API path', () => {
    const response = new Response(null, { status: 500 });
    const url = new URL('https://example.com/dashboard');
    expect(shouldFallThroughToAssets(response, url)).toBe(false);
  });

  it('returns true for a 404 on a path that contains but does not start with /v0/', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/foo/v0/bar');
    expect(shouldFallThroughToAssets(response, url)).toBe(true);
  });

  it('returns true for a 404 on a non-API path that begins with v0 but lacks the slash boundary', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/v0xxx');
    expect(shouldFallThroughToAssets(response, url)).toBe(true);
  });

  it('returns false for a 404 on /v0 exact path', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/v0');
    expect(shouldFallThroughToAssets(response, url)).toBe(false);
  });
});
