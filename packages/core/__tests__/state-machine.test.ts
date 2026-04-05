import { describe, expect, it } from 'vitest';
import { validateTransition, isTerminal } from '../src/state-machine.js';
import type { Task } from '@mostly/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: '01TEST',
    workspace_id: '01WS',
    project_id: null,
    key: 'TASK-1',
    type: 'bug',
    title: 'Test task',
    description: null,
    status: 'open',
    resolution: null,
    assignee_id: null,
    claimed_by_id: null,
    claim_expires_at: null,
    version: 1,
    created_by_id: '01ACTOR',
    updated_by_id: '01ACTOR',
    resolved_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('isTerminal', () => {
  it('closed is terminal', () => expect(isTerminal('closed')).toBe(true));
  it('canceled is terminal', () => expect(isTerminal('canceled')).toBe(true));
  it('open is not terminal', () => expect(isTerminal('open')).toBe(false));
  it('claimed is not terminal', () => expect(isTerminal('claimed')).toBe(false));
  it('in_progress is not terminal', () => expect(isTerminal('in_progress')).toBe(false));
  it('blocked is not terminal', () => expect(isTerminal('blocked')).toBe(false));
});

describe('validateTransition', () => {
  // --- Valid basic transitions ---
  it('open -> claimed (valid)', () => {
    const task = makeTask({ status: 'open' });
    const result = validateTransition(task, 'claimed', null, '01ACTOR');
    expect(result.valid).toBe(true);
  });

  it('open -> closed with resolution completed', () => {
    const task = makeTask({ status: 'open' });
    const result = validateTransition(task, 'closed', 'completed', '01ACTOR');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.sideEffects).toContainEqual({ type: 'set_resolved_at' });
    }
  });

  it('open -> canceled with resolution wont_do', () => {
    const task = makeTask({ status: 'open' });
    const result = validateTransition(task, 'canceled', 'wont_do', '01ACTOR');
    expect(result.valid).toBe(true);
  });

  it('claimed -> in_progress', () => {
    const task = makeTask({ status: 'claimed', claimed_by_id: '01ACTOR' });
    const result = validateTransition(task, 'in_progress', null, '01ACTOR');
    expect(result.valid).toBe(true);
  });

  it('claimed -> blocked', () => {
    const task = makeTask({ status: 'claimed', claimed_by_id: '01ACTOR' });
    const result = validateTransition(task, 'blocked', null, '01ACTOR');
    expect(result.valid).toBe(true);
  });

  it('claimed -> open (release)', () => {
    const task = makeTask({ status: 'claimed', claimed_by_id: '01ACTOR' });
    const result = validateTransition(task, 'open', null, '01ACTOR');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.sideEffects).toContainEqual({ type: 'release_claim' });
    }
  });

  it('in_progress -> blocked', () => {
    const task = makeTask({ status: 'in_progress', claimed_by_id: '01ACTOR' });
    const result = validateTransition(task, 'blocked', null, '01ACTOR');
    expect(result.valid).toBe(true);
  });

  it('in_progress -> open (release)', () => {
    const task = makeTask({ status: 'in_progress', claimed_by_id: '01ACTOR' });
    const result = validateTransition(task, 'open', null, '01ACTOR');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.sideEffects).toContainEqual({ type: 'release_claim' });
    }
  });

  // --- blocked transitions ---
  it('blocked -> open requires active claim (claimer releasing)', () => {
    const task = makeTask({ status: 'blocked', claimed_by_id: '01ACTOR' });
    const result = validateTransition(task, 'open', null, '01ACTOR');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.sideEffects).toContainEqual({ type: 'release_claim' });
    }
  });

  it('blocked -> open without claim is invalid', () => {
    const task = makeTask({ status: 'blocked', claimed_by_id: null });
    const result = validateTransition(task, 'open', null, '01ACTOR');
    expect(result.valid).toBe(false);
  });

  it('blocked -> claimed requires no active claim', () => {
    const task = makeTask({ status: 'blocked', claimed_by_id: null });
    const result = validateTransition(task, 'claimed', null, '01ACTOR');
    expect(result.valid).toBe(true);
  });

  it('blocked -> claimed with existing claim is invalid', () => {
    const task = makeTask({ status: 'blocked', claimed_by_id: '01OTHER' });
    const result = validateTransition(task, 'claimed', null, '01ACTOR');
    expect(result.valid).toBe(false);
  });

  it('blocked -> in_progress requires active claim', () => {
    const task = makeTask({ status: 'blocked', claimed_by_id: '01ACTOR' });
    const result = validateTransition(task, 'in_progress', null, '01ACTOR');
    expect(result.valid).toBe(true);
  });

  it('blocked -> in_progress without claim is invalid', () => {
    const task = makeTask({ status: 'blocked', claimed_by_id: null });
    const result = validateTransition(task, 'in_progress', null, '01ACTOR');
    expect(result.valid).toBe(false);
  });

  // --- Terminal transitions ---
  it('terminal transition with actor as claimer releases claim atomically', () => {
    const task = makeTask({ status: 'in_progress', claimed_by_id: '01ACTOR' });
    const result = validateTransition(task, 'closed', 'completed', '01ACTOR');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.sideEffects).toContainEqual({ type: 'release_claim' });
      expect(result.sideEffects).toContainEqual({ type: 'set_resolved_at' });
    }
  });

  it('terminal transition with someone else holding claim fails', () => {
    const task = makeTask({ status: 'in_progress', claimed_by_id: '01OTHER' });
    const result = validateTransition(task, 'closed', 'completed', '01ACTOR');
    expect(result.valid).toBe(false);
  });

  // --- Invalid transitions ---
  it('closed cannot transition', () => {
    const task = makeTask({ status: 'closed', resolution: 'completed', resolved_at: new Date().toISOString() });
    const result = validateTransition(task, 'open', null, '01ACTOR');
    expect(result.valid).toBe(false);
  });

  it('canceled cannot transition', () => {
    const task = makeTask({ status: 'canceled', resolution: 'wont_do', resolved_at: new Date().toISOString() });
    const result = validateTransition(task, 'open', null, '01ACTOR');
    expect(result.valid).toBe(false);
  });

  it('open -> in_progress is not allowed (must go through claimed)', () => {
    const task = makeTask({ status: 'open' });
    const result = validateTransition(task, 'in_progress', null, '01ACTOR');
    expect(result.valid).toBe(false);
  });

  it('open -> blocked is not allowed', () => {
    const task = makeTask({ status: 'open' });
    const result = validateTransition(task, 'blocked', null, '01ACTOR');
    expect(result.valid).toBe(false);
  });

  // --- Resolution validation ---
  it('closed without resolution is invalid', () => {
    const task = makeTask({ status: 'open' });
    const result = validateTransition(task, 'closed', null, '01ACTOR');
    expect(result.valid).toBe(false);
  });

  it('closed with wrong resolution is invalid', () => {
    const task = makeTask({ status: 'open' });
    const result = validateTransition(task, 'closed', 'wont_do', '01ACTOR');
    expect(result.valid).toBe(false);
  });

  it('canceled without resolution is invalid', () => {
    const task = makeTask({ status: 'open' });
    const result = validateTransition(task, 'canceled', null, '01ACTOR');
    expect(result.valid).toBe(false);
  });

  it('canceled with wrong resolution is invalid', () => {
    const task = makeTask({ status: 'open' });
    const result = validateTransition(task, 'canceled', 'completed', '01ACTOR');
    expect(result.valid).toBe(false);
  });

  it('non-terminal transition with resolution is invalid', () => {
    const task = makeTask({ status: 'open' });
    const result = validateTransition(task, 'claimed', 'completed', '01ACTOR');
    expect(result.valid).toBe(false);
  });

  // --- Expired claim treated as absent ---
  it('expired claim is treated as no claim for blocked -> claimed', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    const task = makeTask({ status: 'blocked', claimed_by_id: '01OTHER', claim_expires_at: past });
    const result = validateTransition(task, 'claimed', null, '01ACTOR');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.sideEffects).toContainEqual({ type: 'clear_expired_claim' });
    }
  });
});
