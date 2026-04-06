import { describe, expect, it } from 'vitest';
import {
  isClaimActive,
  isClaimExpired,
  canAcquireClaim,
  canRenewClaim,
  canReleaseClaim,
} from '../src/claims.js';
import type { Task } from '@mostly/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: '01TEST', workspace_id: '01WS', project_id: null, key: 'TASK-1',
    type: 'bug', title: 'Test', description: null, status: 'open',
    resolution: null, assignee_id: null, claimed_by_id: null,
    claim_expires_at: null, version: 1, created_by_id: '01ACTOR',
    updated_by_id: '01ACTOR', resolved_at: null, created_at: now, updated_at: now,
    ...overrides,
  };
}

describe('isClaimActive', () => {
  it('returns false when no claim', () => {
    expect(isClaimActive(makeTask())).toBe(false);
  });

  it('returns true when claimed with no expiry', () => {
    expect(isClaimActive(makeTask({ claimed_by_id: '01A' }))).toBe(true);
  });

  it('returns true when claimed with future expiry', () => {
    const future = new Date(Date.now() + 60000).toISOString();
    expect(isClaimActive(makeTask({ claimed_by_id: '01A', claim_expires_at: future }))).toBe(true);
  });

  it('returns false when claimed with past expiry', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    expect(isClaimActive(makeTask({ claimed_by_id: '01A', claim_expires_at: past }))).toBe(false);
  });
});

describe('isClaimExpired', () => {
  it('returns false when no claim', () => {
    expect(isClaimExpired(makeTask())).toBe(false);
  });

  it('returns false when claimed with no expiry', () => {
    expect(isClaimExpired(makeTask({ claimed_by_id: '01A' }))).toBe(false);
  });

  it('returns true when claimed with past expiry', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    expect(isClaimExpired(makeTask({ claimed_by_id: '01A', claim_expires_at: past }))).toBe(true);
  });
});

describe('canAcquireClaim', () => {
  it('can acquire on open task with no claim', () => {
    expect(canAcquireClaim(makeTask({ status: 'open' }))).toBe(true);
  });

  it('can acquire on blocked task with no claim', () => {
    expect(canAcquireClaim(makeTask({ status: 'blocked' }))).toBe(true);
  });

  it('cannot acquire on task with active claim', () => {
    expect(canAcquireClaim(makeTask({ status: 'open', claimed_by_id: '01A' }))).toBe(false);
  });

  it('can acquire on task with expired claim', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    expect(canAcquireClaim(makeTask({ status: 'open', claimed_by_id: '01A', claim_expires_at: past }))).toBe(true);
  });

  it('cannot acquire on terminal task', () => {
    expect(canAcquireClaim(makeTask({ status: 'closed', resolution: 'completed' }))).toBe(false);
  });

  it('cannot acquire on claimed task', () => {
    expect(canAcquireClaim(makeTask({ status: 'claimed', claimed_by_id: '01A' }))).toBe(false);
  });

  it('cannot acquire on in_progress task', () => {
    expect(canAcquireClaim(makeTask({ status: 'in_progress', claimed_by_id: '01A' }))).toBe(false);
  });
});

describe('canRenewClaim', () => {
  it('can renew when actor is claimer', () => {
    expect(canRenewClaim(makeTask({ claimed_by_id: '01A' }), '01A')).toBe(true);
  });

  it('cannot renew when actor is not claimer', () => {
    expect(canRenewClaim(makeTask({ claimed_by_id: '01A' }), '01B')).toBe(false);
  });

  it('cannot renew when no claim', () => {
    expect(canRenewClaim(makeTask(), '01A')).toBe(false);
  });
});

describe('canReleaseClaim', () => {
  it('can release when actor is claimer', () => {
    expect(canReleaseClaim(makeTask({ claimed_by_id: '01A' }), '01A')).toBe(true);
  });

  it('cannot release when actor is not claimer', () => {
    expect(canReleaseClaim(makeTask({ claimed_by_id: '01A' }), '01B')).toBe(false);
  });

  it('cannot release when no claim', () => {
    expect(canReleaseClaim(makeTask(), '01A')).toBe(false);
  });
});
