import { describe, expect, it } from 'vitest';
import {
  NotFoundError,
  InvalidArgumentError,
  ConflictError,
  PreconditionFailedError,
  DomainError,
} from '../src/errors.js';

describe('error classes', () => {
  it('NotFoundError has code not_found', () => {
    const err = new NotFoundError('task', 'abc-123');
    expect(err.code).toBe('not_found');
    expect(err.message).toBe('task not found: abc-123');
    expect(err.statusCode).toBe(404);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });

  it('InvalidArgumentError has code invalid_argument', () => {
    const err = new InvalidArgumentError('title is required', {
      title: 'must not be empty',
    });
    expect(err.code).toBe('invalid_argument');
    expect(err.message).toBe('title is required');
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ title: 'must not be empty' });
  });

  it('InvalidArgumentError details are optional', () => {
    const err = new InvalidArgumentError('bad input');
    expect(err.details).toBeUndefined();
  });

  it('ConflictError has code conflict', () => {
    const err = new ConflictError('version mismatch: expected 3, got 5');
    expect(err.code).toBe('conflict');
    expect(err.statusCode).toBe(409);
  });

  it('PreconditionFailedError has code precondition_failed', () => {
    const err = new PreconditionFailedError('task already has an active claim');
    expect(err.code).toBe('precondition_failed');
    expect(err.statusCode).toBe(412);
  });
});
