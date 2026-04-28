import { describe, it, expect } from 'vitest';
import { canonSubpath } from '../src/canon-subpath.js';

describe('canonSubpath', () => {
  it.each([
    [undefined, ''],
    ['', ''],
    ['packages/auth', 'packages/auth'],
    ['packages/auth/', 'packages/auth'],
    ['/packages/auth', 'packages/auth'],
    ['./packages/auth', 'packages/auth'],
    ['  /packages/auth/  ', 'packages/auth'],
    ['packages\\auth', 'packages/auth'],
  ])('%s -> %s', (input, expected) => {
    expect(canonSubpath(input as any)).toBe(expected);
  });
});
