import type { ErrorHandler } from 'hono';
import { DomainError } from '@mostly/types';
import type { AppEnv } from '../app.js';

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof DomainError) {
    return c.json(err.toJSON(), err.statusCode as any);
  }

  console.error('Unhandled error:', err);
  return c.json(
    { error: { code: 'internal_error', message: 'Internal server error' } },
    500,
  );
};
