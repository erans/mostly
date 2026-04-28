import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

// Pull the session cookie off a response, asserting that one was actually
// set. Using the non-null operator directly would throw an unhelpful
// TypeError if the server ever stopped emitting the cookie — this gives a
// clear assertion failure instead.
function getSessionCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie');
  expect(setCookie).not.toBeNull();
  return setCookie!.split(';')[0];
}

describe('auth routes', () => {
  describe('POST /v0/auth/register', () => {
    it('registers first user as admin', async () => {
      const { app } = createTestApp();

      const res = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'admin', password: 'password123' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.handle).toBe('admin');
      expect(body.data.is_admin).toBe(true);

      // Should set session cookie
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('mostly_session=sess_');
    });

    it('rejects registration when closed', async () => {
      const { app } = createTestApp();

      // Register first user
      await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'admin', password: 'password123' }),
      });

      // Second registration should fail (workspace.allow_registration defaults to false)
      const res = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'user2', password: 'password123' }),
      });
      expect(res.status).toBe(403);
    });

    it('validates request body — rejects empty handle and short password', async () => {
      const { app } = createTestApp();

      const res = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: '', password: 'short' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_argument');
      // Both invalid fields should be flagged — a regression that stops
      // validating either one should still fail this test.
      expect(body.error.details).toBeDefined();
      expect(Object.keys(body.error.details)).toEqual(
        expect.arrayContaining(['handle', 'password']),
      );
    });

    it('returns 400 for malformed JSON body (not 500)', async () => {
      const { app } = createTestApp();

      const res = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /v0/auth/login', () => {
    it('logs in with correct credentials', async () => {
      const { app } = createTestApp();

      // Register first
      await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'correct-password' }),
      });

      // Login
      const res = await app.request('/v0/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'correct-password' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.handle).toBe('alice');
      expect(res.headers.get('set-cookie')).toContain('mostly_session=sess_');
    });

    it('rejects wrong password', async () => {
      const { app } = createTestApp();

      await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'correct-password' }),
      });

      const res = await app.request('/v0/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'wrong-password' }),
      });
      expect(res.status).toBe(401);
    });

    it('rejects unknown handle with same generic message as wrong password', async () => {
      const { app } = createTestApp();

      const res = await app.request('/v0/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'nobody', password: 'whatever' }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      // No account-existence disclosure
      expect(body.error.message).toBe('Invalid handle or password');
    });
  });

  describe('GET /v0/auth/me', () => {
    it('returns current user via session cookie', async () => {
      const { app } = createTestApp();

      const regRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'password123' }),
      });
      const sessionCookie = getSessionCookie(regRes);

      const res = await app.request('/v0/auth/me', {
        headers: { Cookie: sessionCookie },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.handle).toBe('alice');
    });

    it('returns 401 without auth', async () => {
      const { app } = createTestApp();
      const res = await app.request('/v0/auth/me');
      expect(res.status).toBe(401);
    });

    it('rejects agent token on /me (human-only endpoint)', async () => {
      const { app, testAgentToken } = createTestApp();
      const res = await app.request('/v0/auth/me', {
        headers: { Authorization: `Bearer ${testAgentToken}` },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /v0/auth/logout', () => {
    it('invalidates the session and clears the cookie', async () => {
      const { app } = createTestApp();

      const regRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'password123' }),
      });
      const sessionCookie = getSessionCookie(regRes);

      const logoutRes = await app.request('/v0/auth/logout', {
        method: 'POST',
        headers: { Cookie: sessionCookie },
      });
      expect(logoutRes.status).toBe(200);

      // Subsequent /me with the same cookie should fail
      const meRes = await app.request('/v0/auth/me', {
        headers: { Cookie: sessionCookie },
      });
      expect(meRes.status).toBe(401);
    });

    it('is idempotent — succeeds even without a session', async () => {
      const { app } = createTestApp();
      const res = await app.request('/v0/auth/logout', { method: 'POST' });
      expect(res.status).toBe(200);
    });
  });

  describe('API keys', () => {
    it('creates and uses an API key', async () => {
      const { app } = createTestApp();

      const regRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'password123' }),
      });
      const sessionCookie = getSessionCookie(regRes);

      // Create API key
      const createRes = await app.request('/v0/auth/api-keys', {
        method: 'POST',
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test-key' }),
      });
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const fullKey = createBody.data.key;
      expect(fullKey.startsWith('msk_')).toBe(true);

      // Use API key to access /v0/auth/me
      const meRes = await app.request('/v0/auth/me', {
        headers: { Authorization: `Bearer ${fullKey}` },
      });
      expect(meRes.status).toBe(200);
      const meBody = await meRes.json();
      expect(meBody.data.handle).toBe('alice');
    });

    it('lists API keys without leaking the full key', async () => {
      const { app } = createTestApp();

      const regRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'password123' }),
      });
      const sessionCookie = getSessionCookie(regRes);

      await app.request('/v0/auth/api-keys', {
        method: 'POST',
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'key1' }),
      });

      const listRes = await app.request('/v0/auth/api-keys', {
        headers: { Cookie: sessionCookie },
      });
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.data.items).toHaveLength(1);
      expect(listBody.data.items[0].name).toBe('key1');
      // Full key must NOT be in the list under any key name — a shape-based
      // check catches regressions where the field is renamed to e.g. `fullKey`
      // but still leaked. `toBeUndefined()` would silently false-pass on a rename.
      expect(Object.keys(listBody.data.items[0])).not.toContain('key');
      expect(Object.keys(listBody.data.items[0])).not.toContain('fullKey');
    });

    it('revokes an API key', async () => {
      const { app } = createTestApp();

      const regRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'password123' }),
      });
      const sessionCookie = getSessionCookie(regRes);

      const createRes = await app.request('/v0/auth/api-keys', {
        method: 'POST',
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'doomed-key' }),
      });
      const createBody = await createRes.json();
      const keyId = createBody.data.id;
      const fullKey = createBody.data.key;

      // Revoke
      const delRes = await app.request(`/v0/auth/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { Cookie: sessionCookie },
      });
      expect(delRes.status).toBe(200);

      // Revoked key can no longer authenticate
      const meRes = await app.request('/v0/auth/me', {
        headers: { Authorization: `Bearer ${fullKey}` },
      });
      expect(meRes.status).toBe(401);
    });

    it('rejects api-keys POST without auth (does not leak validation 400)', async () => {
      const { app } = createTestApp();

      const res = await app.request('/v0/auth/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'foo' }),
      });
      // Auth is checked BEFORE body validation, so this is 401 (not 400)
      expect(res.status).toBe(401);
    });

    it('refuses cross-user revocation — user B cannot delete user A\'s key', async () => {
      const { app } = createTestApp();

      // Admin (first user)
      const adminRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'password123' }),
      });
      const adminCookie = getSessionCookie(adminRes);

      // Admin invites Bob
      const inviteRes = await app.request('/v0/auth/invite', {
        method: 'POST',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'bob' }),
      });
      const inviteToken = (await inviteRes.json()).data.invite_token;

      // Bob accepts — gets his own session
      const acceptRes = await app.request('/v0/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken, password: 'bob-pass' }),
      });
      const bobCookie = getSessionCookie(acceptRes);

      // Admin creates an API key for herself
      const createRes = await app.request('/v0/auth/api-keys', {
        method: 'POST',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'alice-key' }),
      });
      const aliceKey = await createRes.json();
      const aliceKeyId = aliceKey.data.id;
      const aliceFullKey = aliceKey.data.key;

      // Bob tries to revoke Alice's key — must fail as 404 (not owned by bob)
      const delRes = await app.request(`/v0/auth/api-keys/${aliceKeyId}`, {
        method: 'DELETE',
        headers: { Cookie: bobCookie },
      });
      expect(delRes.status).toBe(404);

      // Alice's key must still authenticate — proving it wasn't revoked
      const meRes = await app.request('/v0/auth/me', {
        headers: { Authorization: `Bearer ${aliceFullKey}` },
      });
      expect(meRes.status).toBe(200);
      const meBody = await meRes.json();
      expect(meBody.data.handle).toBe('alice');
    });
  });

  describe('invites', () => {
    it('admin creates invite and invitee accepts', async () => {
      const { app } = createTestApp();

      // Register admin
      const adminRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'admin', password: 'password123' }),
      });
      const adminCookie = getSessionCookie(adminRes);

      // Create invite
      const inviteRes = await app.request('/v0/auth/invite', {
        method: 'POST',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'newuser' }),
      });
      expect(inviteRes.status).toBe(201);
      const inviteBody = await inviteRes.json();
      const inviteToken = inviteBody.data.invite_token;
      expect(inviteToken.startsWith('inv_')).toBe(true);

      // Accept invite
      const acceptRes = await app.request('/v0/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken, password: 'newuser-pass' }),
      });
      expect(acceptRes.status).toBe(201);
      const acceptBody = await acceptRes.json();
      expect(acceptBody.data.handle).toBe('newuser');
      expect(acceptBody.data.is_active).toBe(true);
      expect(acceptBody.data.is_admin).toBe(false);
    });

    it('rejects invite creation by non-admin', async () => {
      const { app } = createTestApp();

      // Register admin
      const adminRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'admin', password: 'password123' }),
      });
      const adminCookie = getSessionCookie(adminRes);

      // Admin invites a regular user
      const inviteRes = await app.request('/v0/auth/invite', {
        method: 'POST',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'regular' }),
      });
      const inviteToken = (await inviteRes.json()).data.invite_token;

      // Regular user accepts the invite
      const acceptRes = await app.request('/v0/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken, password: 'regular-pass' }),
      });
      const regularCookie = getSessionCookie(acceptRes);

      // Regular user tries to invite someone — should be forbidden
      const res = await app.request('/v0/auth/invite', {
        method: 'POST',
        headers: { Cookie: regularCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'someone' }),
      });
      expect(res.status).toBe(403);
    });

    it('rejects invalid invite token', async () => {
      const { app } = createTestApp();

      const res = await app.request('/v0/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'inv_bogus', password: 'password123' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /v0/auth/reset-password', () => {
    it('admin resets another user\'s password and old sessions are invalidated', async () => {
      const { app } = createTestApp();

      // Register admin
      const adminRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'admin', password: 'adminpass1' }),
      });
      const adminCookie = getSessionCookie(adminRes);

      // Admin invites and targets accepts
      const inviteRes = await app.request('/v0/auth/invite', {
        method: 'POST',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice' }),
      });
      const inviteToken = (await inviteRes.json()).data.invite_token;
      const acceptRes = await app.request('/v0/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken, password: 'original-pass' }),
      });
      const aliceCookie = getSessionCookie(acceptRes);

      // Admin resets alice's password
      const resetRes = await app.request('/v0/auth/reset-password', {
        method: 'POST',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'fresh-password-1' }),
      });
      expect(resetRes.status).toBe(200);
      const body = await resetRes.json();
      expect(body.data.success).toBe(true);

      // Alice's old session should be invalidated
      const meRes = await app.request('/v0/auth/me', {
        headers: { Cookie: aliceCookie },
      });
      expect(meRes.status).toBe(401);

      // Alice should be able to login with the new password
      const loginRes = await app.request('/v0/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'fresh-password-1' }),
      });
      expect(loginRes.status).toBe(200);

      // Old password should no longer work
      const oldLoginRes = await app.request('/v0/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'original-pass' }),
      });
      expect(oldLoginRes.status).toBe(401);
    });

    it('rejects reset from non-admin', async () => {
      const { app } = createTestApp();

      // Admin + alice
      const adminRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'admin', password: 'adminpass1' }),
      });
      const adminCookie = getSessionCookie(adminRes);

      const inviteRes = await app.request('/v0/auth/invite', {
        method: 'POST',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice' }),
      });
      const inviteToken = (await inviteRes.json()).data.invite_token;
      const acceptRes = await app.request('/v0/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken, password: 'alice-pass' }),
      });
      const aliceCookie = getSessionCookie(acceptRes);

      // Alice (non-admin) tries to reset admin's password
      const res = await app.request('/v0/auth/reset-password', {
        method: 'POST',
        headers: { Cookie: aliceCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'admin', password: 'hijacked1' }),
      });
      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown target handle', async () => {
      const { app } = createTestApp();

      const adminRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'admin', password: 'adminpass1' }),
      });
      const adminCookie = getSessionCookie(adminRes);

      const res = await app.request('/v0/auth/reset-password', {
        method: 'POST',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'ghost', password: 'whatever1' }),
      });
      expect(res.status).toBe(404);
    });

    it('requires authentication', async () => {
      const { app } = createTestApp();

      const res = await app.request('/v0/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'admin', password: 'whatever1' }),
      });
      expect(res.status).toBe(401);
    });

    it('validates request body — rejects short password', async () => {
      const { app } = createTestApp();

      const adminRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'admin', password: 'adminpass1' }),
      });
      const adminCookie = getSessionCookie(adminRes);

      const res = await app.request('/v0/auth/reset-password', {
        method: 'POST',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'admin', password: 'short' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_argument');
      expect(Object.keys(body.error.details)).toContain('password');
    });
  });

  describe('invites with email', () => {
    it('invite with email persists it on the principal', async () => {
      const { app } = createTestApp();

      const adminRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'admin', password: 'password123' }),
      });
      const adminCookie = getSessionCookie(adminRes);

      const inviteRes = await app.request('/v0/auth/invite', {
        method: 'POST',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'newuser', email: 'newuser@example.com' }),
      });
      expect(inviteRes.status).toBe(201);
      const inviteBody = await inviteRes.json();
      expect(inviteBody.data.principal.email).toBe('newuser@example.com');

      // Accept invite and verify email persists
      const acceptRes = await app.request('/v0/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteBody.data.invite_token, password: 'newuser-pass' }),
      });
      expect(acceptRes.status).toBe(201);
      expect((await acceptRes.json()).data.email).toBe('newuser@example.com');
    });

    it('rejects invite with invalid email with 400', async () => {
      const { app } = createTestApp();

      const adminRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'admin', password: 'password123' }),
      });
      const adminCookie = getSessionCookie(adminRes);

      const res = await app.request('/v0/auth/invite', {
        method: 'POST',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'newuser', email: 'not-an-email' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.details).toHaveProperty('email');
    });
  });

  describe('PATCH /v0/auth/me', () => {
    it('updates email on own principal; GET /me reflects the change', async () => {
      const { app } = createTestApp();

      const regRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'password123' }),
      });
      const sessionCookie = getSessionCookie(regRes);

      // Initially no email
      const meBefore = await app.request('/v0/auth/me', {
        headers: { Cookie: sessionCookie },
      });
      expect((await meBefore.json()).data.email).toBeNull();

      // PATCH email
      const patchRes = await app.request('/v0/auth/me', {
        method: 'PATCH',
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      });
      expect(patchRes.status).toBe(200);
      expect((await patchRes.json()).data.email).toBe('alice@example.com');

      // GET /me now reflects the email
      const meAfter = await app.request('/v0/auth/me', {
        headers: { Cookie: sessionCookie },
      });
      expect((await meAfter.json()).data.email).toBe('alice@example.com');
    });

    it('can clear email by patching null', async () => {
      const { app } = createTestApp();

      const regRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'password123' }),
      });
      const sessionCookie = getSessionCookie(regRes);

      // Set email
      await app.request('/v0/auth/me', {
        method: 'PATCH',
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      });

      // Clear it
      const patchRes = await app.request('/v0/auth/me', {
        method: 'PATCH',
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: null }),
      });
      expect(patchRes.status).toBe(200);
      expect((await patchRes.json()).data.email).toBeNull();
    });

    it('rejects invalid email format with 400', async () => {
      const { app } = createTestApp();

      const regRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'password123' }),
      });
      const sessionCookie = getSessionCookie(regRes);

      const res = await app.request('/v0/auth/me', {
        method: 'PATCH',
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.details).toHaveProperty('email');
    });

    it('requires authentication', async () => {
      const { app } = createTestApp();
      const res = await app.request('/v0/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      });
      expect(res.status).toBe(401);
    });

    it('also works with API key auth', async () => {
      const { app } = createTestApp();

      const regRes = await app.request('/v0/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'alice', password: 'password123' }),
      });
      const sessionCookie = getSessionCookie(regRes);

      const keyRes = await app.request('/v0/auth/api-keys', {
        method: 'POST',
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'my-key' }),
      });
      const apiKey = (await keyRes.json()).data.key;

      const patchRes = await app.request('/v0/auth/me', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      });
      expect(patchRes.status).toBe(200);
      expect((await patchRes.json()).data.email).toBe('alice@example.com');
    });
  });

  describe('PATCH /v0/principals/:id email round-trip', () => {
    it('PATCH email via :id and subsequent GET reflects new value', async () => {
      const { app, testAgentToken, testPrincipalId } = createTestApp();

      const patchRes = await app.request(`/v0/principals/${testPrincipalId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'agent@example.com', actor_id: testPrincipalId }),
      });
      expect(patchRes.status).toBe(200);
      expect((await patchRes.json()).data.email).toBe('agent@example.com');

      const getRes = await app.request(`/v0/principals/${testPrincipalId}`, {
        headers: { Authorization: `Bearer ${testAgentToken}` },
      });
      expect((await getRes.json()).data.email).toBe('agent@example.com');
    });
  });
});
