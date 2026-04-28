import { describe, expect, it } from 'vitest';
import { inferTaskFromBranch } from '../src/task-key-from-branch.js';

describe('inferTaskFromBranch', () => {
  it('returns null for null branch', () => {
    expect(inferTaskFromBranch(null, 'AUTH')).toBeNull();
  });

  it('extracts AUTH-1 from AUTH-1-add-login', () => {
    expect(inferTaskFromBranch('AUTH-1-add-login', 'AUTH')).toBe('AUTH-1');
  });

  it('extracts AUTH-1 from feature/AUTH-1', () => {
    expect(inferTaskFromBranch('feature/AUTH-1', 'AUTH')).toBe('AUTH-1');
  });

  it('extracts AUTH-1 from eran/AUTH-1-foo', () => {
    expect(inferTaskFromBranch('eran/AUTH-1-foo', 'AUTH')).toBe('AUTH-1');
  });

  it('returns null for main', () => {
    expect(inferTaskFromBranch('main', 'AUTH')).toBeNull();
  });

  it('returns null when key is lowercase (case-sensitive)', () => {
    expect(inferTaskFromBranch('auth-1-foo', 'AUTH')).toBeNull();
  });

  it('returns null when project key does not match', () => {
    expect(inferTaskFromBranch('AUTH-1-foo', 'BILLING')).toBeNull();
  });

  it('uses the first match if multiple keys appear', () => {
    expect(inferTaskFromBranch('AUTH-1-related-AUTH-2', 'AUTH')).toBe('AUTH-1');
  });
});
