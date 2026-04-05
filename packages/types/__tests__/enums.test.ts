import { describe, expect, it } from 'vitest';
import {
  PrincipalKind,
  TaskType,
  TaskStatus,
  Resolution,
  TERMINAL_STATUSES,
  RESOLUTION_FOR_STATUS,
  TaskUpdateKind,
  SourceKind,
} from '../src/enums.js';

describe('enums', () => {
  it('PrincipalKind has expected values', () => {
    expect(PrincipalKind.human).toBe('human');
    expect(PrincipalKind.agent).toBe('agent');
    expect(PrincipalKind.service).toBe('service');
    expect(Object.keys(PrincipalKind)).toHaveLength(3);
  });

  it('TaskType has expected values', () => {
    expect(Object.keys(TaskType)).toHaveLength(6);
    expect(TaskType.feature).toBe('feature');
    expect(TaskType.bug).toBe('bug');
    expect(TaskType.chore).toBe('chore');
    expect(TaskType.research).toBe('research');
    expect(TaskType.incident).toBe('incident');
    expect(TaskType.question).toBe('question');
  });

  it('TaskStatus has expected values', () => {
    expect(Object.keys(TaskStatus)).toHaveLength(6);
    expect(TaskStatus.open).toBe('open');
    expect(TaskStatus.claimed).toBe('claimed');
    expect(TaskStatus.in_progress).toBe('in_progress');
    expect(TaskStatus.blocked).toBe('blocked');
    expect(TaskStatus.closed).toBe('closed');
    expect(TaskStatus.canceled).toBe('canceled');
  });

  it('Resolution has expected values', () => {
    expect(Object.keys(Resolution)).toHaveLength(5);
    expect(Resolution.completed).toBe('completed');
    expect(Resolution.duplicate).toBe('duplicate');
    expect(Resolution.invalid).toBe('invalid');
    expect(Resolution.wont_do).toBe('wont_do');
    expect(Resolution.deferred).toBe('deferred');
  });

  it('TERMINAL_STATUSES includes closed and canceled', () => {
    expect(TERMINAL_STATUSES).toContain('closed');
    expect(TERMINAL_STATUSES).toContain('canceled');
    expect(TERMINAL_STATUSES).toHaveLength(2);
  });

  it('RESOLUTION_FOR_STATUS maps correctly', () => {
    expect(RESOLUTION_FOR_STATUS.closed).toEqual(['completed', 'duplicate', 'invalid']);
    expect(RESOLUTION_FOR_STATUS.canceled).toEqual(['wont_do', 'deferred']);
  });

  it('TaskUpdateKind has expected values', () => {
    expect(Object.keys(TaskUpdateKind)).toHaveLength(9);
    expect(TaskUpdateKind.note).toBe('note');
    expect(TaskUpdateKind.system).toBe('system');
  });

  it('SourceKind has expected values', () => {
    expect(Object.keys(SourceKind)).toHaveLength(6);
    expect(SourceKind.cli_session).toBe('cli_session');
    expect(SourceKind.github_issue).toBe('github_issue');
  });
});
