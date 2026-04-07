import { createHash, randomBytes } from 'crypto';

/**
 * Generate a random token with the given prefix, e.g. "sess_", "msk_", "mat_",
 * "inv_". The entropy portion is a hex-encoded 32-byte random string.
 */
export function generateToken(prefix: string): string {
  return prefix + randomBytes(32).toString('hex');
}

/**
 * SHA-256 of a UTF-8 string, hex-encoded. Used to hash tokens before they are
 * stored at rest — we never persist the raw token.
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
