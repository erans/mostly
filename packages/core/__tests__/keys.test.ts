import { describe, expect, it } from 'vitest';
import { formatTaskKey, parseTaskKey, isTaskKey, DEFAULT_PREFIX } from '../src/keys.js';

describe('formatTaskKey', () => {
  it('formats prefix and number', () => {
    expect(formatTaskKey('AUTH', 12)).toBe('AUTH-12');
  });

  it('formats default prefix', () => {
    expect(formatTaskKey('TASK', 1)).toBe('TASK-1');
  });
});

describe('parseTaskKey', () => {
  it('parses a valid key', () => {
    expect(parseTaskKey('AUTH-12')).toEqual({ prefix: 'AUTH', number: 12 });
  });

  it('parses default prefix key', () => {
    expect(parseTaskKey('TASK-44')).toEqual({ prefix: 'TASK', number: 44 });
  });

  it('returns null for invalid key', () => {
    expect(parseTaskKey('not-a-key')).toBeNull();
    expect(parseTaskKey('auth-12')).toBeNull();
    expect(parseTaskKey('AUTH')).toBeNull();
    expect(parseTaskKey('')).toBeNull();
  });
});

describe('isTaskKey', () => {
  it('returns true for valid keys', () => {
    expect(isTaskKey('AUTH-1')).toBe(true);
    expect(isTaskKey('TASK-999')).toBe(true);
    expect(isTaskKey('OPS-42')).toBe(true);
  });

  it('returns false for ULIDs and invalid strings', () => {
    expect(isTaskKey('01JQXYZ1234567890ABCDEF')).toBe(false);
    expect(isTaskKey('auth-1')).toBe(false);
    expect(isTaskKey('')).toBe(false);
  });
});

describe('DEFAULT_PREFIX', () => {
  it('is TASK', () => {
    expect(DEFAULT_PREFIX).toBe('TASK');
  });
});
