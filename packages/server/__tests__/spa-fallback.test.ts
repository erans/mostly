import { describe, it, expect } from 'vitest';
import { isSpaFallbackPath } from '../src/spa-fallback.js';

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

  it('returns false for missing static asset paths (known extensions)', () => {
    expect(isSpaFallbackPath('GET', '/favicon.ico')).toBe(false);
    expect(isSpaFallbackPath('GET', '/robots.txt')).toBe(false);
    expect(isSpaFallbackPath('GET', '/assets/app.js')).toBe(false);
    expect(isSpaFallbackPath('GET', '/assets/style.css')).toBe(false);
    expect(isSpaFallbackPath('GET', '/page.html')).toBe(false);
    expect(isSpaFallbackPath('GET', '/worker.mjs')).toBe(false);
    expect(isSpaFallbackPath('GET', '/runtime.wasm')).toBe(false);
    expect(isSpaFallbackPath('GET', '/photo.avif')).toBe(false);
    expect(isSpaFallbackPath('GET', '/doc.pdf')).toBe(false);
  });

  it('returns false for static asset extensions regardless of case', () => {
    expect(isSpaFallbackPath('GET', '/favicon.ICO')).toBe(false);
    expect(isSpaFallbackPath('GET', '/assets/App.JS')).toBe(false);
  });

  it('returns true for dotted SPA routes (not known asset extensions)', () => {
    expect(isSpaFallbackPath('GET', '/releases/v1.2')).toBe(true);
    expect(isSpaFallbackPath('GET', '/users/john.doe')).toBe(true);
  });
});
