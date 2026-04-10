import { describe, it, expect } from 'vitest';
import { shouldFallThroughToAssets } from '../src/worker.js';

function makeRequest(urlStr: string, method = 'GET'): Request {
  return new Request(urlStr, { method });
}

describe('shouldFallThroughToAssets', () => {
  it('returns true for a 404 GET on a non-API path', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/dashboard');
    expect(shouldFallThroughToAssets(response, makeRequest(url.href), url)).toBe(true);
  });

  it('returns true for a 404 GET on the root path', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/');
    expect(shouldFallThroughToAssets(response, makeRequest(url.href), url)).toBe(true);
  });

  it('returns false for a 404 GET on an API path', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/v0/tasks/missing');
    expect(shouldFallThroughToAssets(response, makeRequest(url.href), url)).toBe(false);
  });

  it('returns false for a 200 response even on a non-API path', () => {
    const response = new Response('ok', { status: 200 });
    const url = new URL('https://example.com/dashboard');
    expect(shouldFallThroughToAssets(response, makeRequest(url.href), url)).toBe(false);
  });

  it('returns false for a 500 response on a non-API path', () => {
    const response = new Response(null, { status: 500 });
    const url = new URL('https://example.com/dashboard');
    expect(shouldFallThroughToAssets(response, makeRequest(url.href), url)).toBe(false);
  });

  it('returns true for a 404 GET on a path that contains but does not start with /v0/', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/foo/v0/bar');
    expect(shouldFallThroughToAssets(response, makeRequest(url.href), url)).toBe(true);
  });

  it('returns true for a 404 GET on a non-API path that begins with v0 but lacks the slash boundary', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/v0xxx');
    expect(shouldFallThroughToAssets(response, makeRequest(url.href), url)).toBe(true);
  });

  it('returns false for a 404 GET on /v0 exact path', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/v0');
    expect(shouldFallThroughToAssets(response, makeRequest(url.href), url)).toBe(false);
  });

  it('returns false for a 404 POST on a non-API path', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/dashboard');
    expect(shouldFallThroughToAssets(response, makeRequest(url.href, 'POST'), url)).toBe(false);
  });

  it('returns false for a 404 GET on /healthz', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/healthz');
    expect(shouldFallThroughToAssets(response, makeRequest(url.href), url)).toBe(false);
  });

  it('returns false for a 404 GET on a known static asset extension', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/assets/app.js');
    expect(shouldFallThroughToAssets(response, makeRequest(url.href), url)).toBe(false);
  });

  it('returns true for a 404 GET on a dotted SPA route', () => {
    const response = new Response(null, { status: 404 });
    const url = new URL('https://example.com/releases/v1.2');
    expect(shouldFallThroughToAssets(response, makeRequest(url.href), url)).toBe(true);
  });
});
