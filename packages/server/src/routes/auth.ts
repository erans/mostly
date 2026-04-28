import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import {
  RegisterRequest,
  LoginRequest,
  AcceptInviteRequest,
  CreateApiKeyRequest,
  InviteRequest,
  ResetPasswordRequest,
  InvalidArgumentError,
  UnauthorizedError,
} from '@mostly/types';
import type { AppEnv } from '../app.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'Lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};

function getCookieOptions(c: Context<AppEnv>) {
  // Tie `secure` to the actual scheme rather than the hostname. This
  // correctly handles localhost, [::1], 0.0.0.0, and any other dev address
  // served over plain HTTP — browsers reject `Secure` cookies on http://
  // origins, which would silently break login.
  const url = new URL(c.req.url);
  return { ...COOKIE_OPTIONS, secure: url.protocol === 'https:' };
}

// Helper: require human authentication (session or API key only — not agent token).
// Auth routes are mounted BEFORE the /v0/* auth middleware, so authenticated
// routes here must check auth themselves.
async function requireHumanAuth(
  c: Context<AppEnv>,
): Promise<{ principalId: string; workspaceId: string }> {
  const authService = c.get('authService');

  // Try session cookie
  const sessionId = getCookie(c, 'mostly_session');
  if (sessionId) {
    const result = await authService.validateSession(sessionId);
    if (result) {
      return { principalId: result.principal.id, workspaceId: result.workspaceId };
    }
  }

  // Try Bearer token (API key only — agent tokens identify a workspace, not a user)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const result = await authService.validateApiKey(token);
    if (result) {
      return { principalId: result.principal.id, workspaceId: result.workspaceId };
    }
  }

  throw new UnauthorizedError('Authentication required');
}

// Read JSON body and validate against a Zod schema in a single step.
// Treats malformed/missing JSON as an empty object so the schema produces a
// proper 400 with field-level details, not a 500.
async function parseJsonBody<S extends z.ZodTypeAny>(
  c: Context<AppEnv>,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      details[issue.path.join('.')] = issue.message;
    }
    throw new InvalidArgumentError('Invalid request body', details);
  }
  return parsed.data;
}

export function authRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // --- Unauthenticated routes ---

  // POST /v0/auth/register
  routes.post('/register', async (c) => {
    const data = await parseJsonBody(c, RegisterRequest);

    const authService = c.get('authService');
    const workspaceId = c.get('workspaceId');

    const { principal, sessionId } = await authService.register(workspaceId, data);
    setCookie(c, 'mostly_session', sessionId, getCookieOptions(c));

    return c.json({ data: principal }, 201);
  });

  // POST /v0/auth/login
  routes.post('/login', async (c) => {
    const data = await parseJsonBody(c, LoginRequest);

    const authService = c.get('authService');
    const workspaceId = c.get('workspaceId');

    const { principal, sessionId } = await authService.login(workspaceId, data.handle, data.password);
    setCookie(c, 'mostly_session', sessionId, getCookieOptions(c));

    return c.json({ data: principal });
  });

  // POST /v0/auth/accept-invite
  routes.post('/accept-invite', async (c) => {
    const data = await parseJsonBody(c, AcceptInviteRequest);

    const authService = c.get('authService');

    const { principal, sessionId } = await authService.acceptInvite(data.token, data.password);
    setCookie(c, 'mostly_session', sessionId, getCookieOptions(c));

    return c.json({ data: principal }, 201);
  });

  // --- Authenticated routes (session cookie or API key) ---

  // GET /v0/auth/me
  routes.get('/me', async (c) => {
    const { principalId } = await requireHumanAuth(c);
    const principalService = c.get('principalService');
    const principal = await principalService.get(principalId);
    return c.json({ data: principal });
  });

  // PATCH /v0/auth/me — update own principal (only email and display_name allowed)
  routes.patch('/me', async (c) => {
    const { principalId } = await requireHumanAuth(c);
    // Restrict to only safe self-update fields (no kind, is_active, etc.).
    // .strict() rejects unknown keys; .refine() ensures at least one field is present.
    const UpdateMeRequest = z.object({
      email: z.string().email().nullable().optional(),
      display_name: z.string().nullable().optional(),
    }).strict().refine(
      (d) => d.email !== undefined || d.display_name !== undefined,
      { message: 'must include at least one of: email, display_name' },
    );
    const data = await parseJsonBody(c, UpdateMeRequest);
    const principalService = c.get('principalService');
    const principal = await principalService.update(principalId, data);
    return c.json({ data: principal });
  });

  // POST /v0/auth/logout
  routes.post('/logout', async (c) => {
    const authService = c.get('authService');
    const sessionId = getCookie(c, 'mostly_session');
    if (sessionId) {
      await authService.deleteSession(sessionId);
    }
    deleteCookie(c, 'mostly_session', { path: '/' });
    return c.json({ data: { success: true } });
  });

  // POST /v0/auth/api-keys
  routes.post('/api-keys', async (c) => {
    const { principalId, workspaceId } = await requireHumanAuth(c);
    const data = await parseJsonBody(c, CreateApiKeyRequest);

    const authService = c.get('authService');
    const { apiKey, fullKey } = await authService.createApiKey(principalId, workspaceId, data.name);
    return c.json({ data: { ...apiKey, key: fullKey } }, 201);
  });

  // GET /v0/auth/api-keys
  routes.get('/api-keys', async (c) => {
    const { principalId } = await requireHumanAuth(c);
    const authService = c.get('authService');

    const keys = await authService.listApiKeys(principalId);
    return c.json({ data: { items: keys } });
  });

  // DELETE /v0/auth/api-keys/:id
  routes.delete('/api-keys/:id', async (c) => {
    const id = c.req.param('id');
    const { principalId } = await requireHumanAuth(c);
    const authService = c.get('authService');

    await authService.revokeApiKey(id, principalId);
    return c.json({ data: { success: true } });
  });

  // POST /v0/auth/invite
  routes.post('/invite', async (c) => {
    const { principalId, workspaceId } = await requireHumanAuth(c);
    const data = await parseJsonBody(c, InviteRequest);

    const authService = c.get('authService');
    const { principal, inviteToken } = await authService.createInvite(workspaceId, principalId, {
      handle: data.handle,
      display_name: data.display_name,
      email: data.email,
    });
    return c.json({ data: { principal, invite_token: inviteToken } }, 201);
  });

  // POST /v0/auth/reset-password
  //
  // Admin-only. Resets the target user's password hash and invalidates all
  // their existing sessions. AuthService enforces the admin check and
  // refuses to reset agents/services.
  routes.post('/reset-password', async (c) => {
    const { principalId, workspaceId } = await requireHumanAuth(c);
    const data = await parseJsonBody(c, ResetPasswordRequest);

    const authService = c.get('authService');
    await authService.resetPassword(principalId, data.handle, workspaceId, data.password);
    return c.json({ data: { success: true } });
  });

  return routes;
}
