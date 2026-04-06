import { describe, it, expect } from 'vitest';
import { generateId, parseIdPrefix, ID_PREFIXES } from '../src/ids.js';

describe('generateId', () => {
  it('produces an ID with the given prefix', () => {
    const id = generateId('tsk');
    expect(id.startsWith('tsk_')).toBe(true);
  });

  it('random part is 8 characters of Crockford Base32', () => {
    const id = generateId('ws');
    const random = id.slice(id.indexOf('_') + 1);
    expect(random).toHaveLength(8);
    expect(random).toMatch(/^[0-9a-hjkmnp-tv-z]{8}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId('proj')));
    expect(ids.size).toBe(100);
  });

  it('works with all known prefixes', () => {
    for (const prefix of Object.values(ID_PREFIXES)) {
      const id = generateId(prefix);
      expect(id.startsWith(`${prefix}_`)).toBe(true);
    }
  });
});

describe('parseIdPrefix', () => {
  it('extracts prefix from a valid ID', () => {
    expect(parseIdPrefix('tsk_k2pn5jw8')).toBe('tsk');
    expect(parseIdPrefix('proj_x8rb4wc6')).toBe('proj');
    expect(parseIdPrefix('ws_a3kf9x2m')).toBe('ws');
  });

  it('returns null for IDs without underscore', () => {
    expect(parseIdPrefix('nounderscore')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseIdPrefix('')).toBeNull();
  });

  it('returns null for IDs with empty prefix', () => {
    expect(parseIdPrefix('_abc')).toBeNull();
  });

  it('returns null for unknown prefixes', () => {
    expect(parseIdPrefix('foo_12345678')).toBeNull();
    expect(parseIdPrefix('unknown_abc')).toBeNull();
  });
});
