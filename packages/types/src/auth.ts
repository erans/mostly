import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';

// --- Schemas ---

export const SessionSchema = z.object({
  id: z.string(),
  principal_id: z.string(),
  workspace_id: z.string(),
  expires_at: z.string(),
  created_at: z.string(),
});
export type Session = z.infer<typeof SessionSchema>;

export const ApiKeySchema = z.object({
  id: z.string(),
  principal_id: z.string(),
  workspace_id: z.string(),
  name: z.string(),
  key_prefix: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

// --- Auth request types ---

export const RegisterRequest = z.object({
  handle: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/, 'handle must be lowercase alphanumeric, hyphens, or underscores'),
  password: z.string().min(8).max(128),
  display_name: z.string().max(128).optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const LoginRequest = z.object({
  handle: z.string().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const AcceptInviteRequest = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequest>;

export const CreateApiKeyRequest = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/, 'name must be lowercase alphanumeric, hyphens, or underscores'),
});
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequest>;

export const InviteRequest = z.object({
  handle: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/, 'handle must be lowercase alphanumeric, hyphens, or underscores'),
  display_name: z.string().max(128).optional(),
});
export type InviteRequest = z.infer<typeof InviteRequest>;

// --- Token generation ---

export function generateToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString('hex')}`;
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// --- Constants ---

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
