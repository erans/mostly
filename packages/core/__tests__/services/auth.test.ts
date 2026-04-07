import { describe, expect, it, beforeEach } from 'vitest';
import { AuthService } from '../../src/services/auth.js';
import {
  FakePrincipalRepository,
  FakeWorkspaceRepository,
  FakeSessionRepository,
  FakeApiKeyRepository,
  makeWorkspace,
} from '../../src/test-utils/index.js';
import { UnauthorizedError, ForbiddenError, ConflictError, NotFoundError, sha256, generateToken } from '@mostly/types';

describe('AuthService', () => {
  let authService: AuthService;
  let principals: FakePrincipalRepository;
  let workspaces: FakeWorkspaceRepository;
  let sessions: FakeSessionRepository;
  let apiKeys: FakeApiKeyRepository;
  let workspaceId: string;

  beforeEach(async () => {
    principals = new FakePrincipalRepository();
    workspaces = new FakeWorkspaceRepository();
    sessions = new FakeSessionRepository();
    apiKeys = new FakeApiKeyRepository();
    authService = new AuthService(principals, workspaces, sessions, apiKeys);

    const ws = makeWorkspace({ slug: 'default' });
    await workspaces.create({
      id: ws.id,
      slug: ws.slug,
      name: ws.name,
      created_at: ws.created_at,
      updated_at: ws.updated_at,
    });
    workspaceId = ws.id;
  });

  describe('register', () => {
    it('creates first user as admin', async () => {
      const result = await authService.register(workspaceId, {
        handle: 'admin',
        password: 'password123',
        display_name: 'Admin User',
      });
      expect(result.principal.handle).toBe('admin');
      expect(result.principal.is_admin).toBe(true);
      expect(result.principal.kind).toBe('human');
      expect(result.sessionId).toBeTruthy();
      expect(result.sessionId.startsWith('sess_')).toBe(true);
    });

    it('creates second user as non-admin when registration is open', async () => {
      await authService.register(workspaceId, { handle: 'admin', password: 'password123' });
      await workspaces.update(workspaceId, { allow_registration: true, updated_at: new Date().toISOString() });

      const result = await authService.register(workspaceId, { handle: 'user2', password: 'password123' });
      expect(result.principal.is_admin).toBe(false);
    });

    it('rejects registration when closed and not first user', async () => {
      await authService.register(workspaceId, { handle: 'admin', password: 'password123' });
      await expect(
        authService.register(workspaceId, { handle: 'user2', password: 'password123' }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects duplicate handle', async () => {
      await authService.register(workspaceId, { handle: 'admin', password: 'password123' });
      await workspaces.update(workspaceId, { allow_registration: true, updated_at: new Date().toISOString() });
      await expect(
        authService.register(workspaceId, { handle: 'admin', password: 'password456' }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('login', () => {
    it('logs in with correct credentials', async () => {
      await authService.register(workspaceId, { handle: 'alice', password: 'correct-password' });
      const result = await authService.login(workspaceId, 'alice', 'correct-password');
      expect(result.principal.handle).toBe('alice');
      expect(result.sessionId).toBeTruthy();
    });

    it('rejects wrong password', async () => {
      await authService.register(workspaceId, { handle: 'alice', password: 'correct-password' });
      await expect(
        authService.login(workspaceId, 'alice', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects non-existent handle', async () => {
      await expect(
        authService.login(workspaceId, 'nobody', 'password'),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects inactive account', async () => {
      const { principal } = await authService.register(workspaceId, { handle: 'alice', password: 'password123' });
      await principals.update(principal.id, { is_active: false, updated_at: new Date().toISOString() });
      await expect(
        authService.login(workspaceId, 'alice', 'password123'),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects non-human principal', async () => {
      // Create an agent principal with a password hash (shouldn't happen, but tests the guard)
      const now = new Date().toISOString();
      await principals.create({
        id: 'prin_agent1',
        workspace_id: workspaceId,
        handle: 'bot',
        kind: 'agent',
        display_name: null,
        metadata_json: null,
        password_hash: 'fake-hash',
        is_active: true,
        is_admin: false,
        created_at: now,
        updated_at: now,
      });
      await expect(
        authService.login(workspaceId, 'bot', 'password'),
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('sessions', () => {
    it('validates a valid session', async () => {
      const { principal, sessionId } = await authService.register(workspaceId, {
        handle: 'alice',
        password: 'password123',
      });
      const result = await authService.validateSession(sessionId);
      expect(result).not.toBeNull();
      expect(result!.principal.id).toBe(principal.id);
    });

    it('returns null for non-existent session', async () => {
      const result = await authService.validateSession('sess_nonexistent');
      expect(result).toBeNull();
    });

    it('deletes session on logout', async () => {
      const { sessionId } = await authService.register(workspaceId, {
        handle: 'alice',
        password: 'password123',
      });
      await authService.deleteSession(sessionId);
      const result = await authService.validateSession(sessionId);
      expect(result).toBeNull();
    });

    it('returns null for expired session', async () => {
      const { sessionId } = await authService.register(workspaceId, {
        handle: 'alice',
        password: 'password123',
      });
      await sessions.updateExpiresAt(sessionId, new Date(0).toISOString());
      const result = await authService.validateSession(sessionId);
      expect(result).toBeNull();
    });
  });

  describe('API keys', () => {
    it('creates and validates an API key', async () => {
      const { principal } = await authService.register(workspaceId, {
        handle: 'alice',
        password: 'password123',
      });
      const { apiKey, fullKey } = await authService.createApiKey(principal.id, workspaceId, 'laptop');
      expect(apiKey.name).toBe('laptop');
      expect(fullKey.startsWith('msk_')).toBe(true);

      const result = await authService.validateApiKey(fullKey);
      expect(result).not.toBeNull();
      expect(result!.principal.id).toBe(principal.id);
    });

    it('rejects duplicate key names', async () => {
      const { principal } = await authService.register(workspaceId, {
        handle: 'alice',
        password: 'password123',
      });
      await authService.createApiKey(principal.id, workspaceId, 'laptop');
      await expect(
        authService.createApiKey(principal.id, workspaceId, 'laptop'),
      ).rejects.toThrow(ConflictError);
    });

    it('lists keys', async () => {
      const { principal } = await authService.register(workspaceId, {
        handle: 'alice',
        password: 'password123',
      });
      await authService.createApiKey(principal.id, workspaceId, 'laptop');
      await authService.createApiKey(principal.id, workspaceId, 'ci');
      const keys = await authService.listApiKeys(principal.id);
      expect(keys).toHaveLength(2);
      keys.forEach((k) => expect((k as Record<string, unknown>).key_hash).toBeUndefined());
    });

    it('revokes a key', async () => {
      const { principal } = await authService.register(workspaceId, {
        handle: 'alice',
        password: 'password123',
      });
      const { apiKey, fullKey } = await authService.createApiKey(principal.id, workspaceId, 'laptop');
      await authService.revokeApiKey(apiKey.id, principal.id);

      const result = await authService.validateApiKey(fullKey);
      expect(result).toBeNull();
    });
  });

  describe('invites', () => {
    it('creates and accepts an invite', async () => {
      const { principal: admin } = await authService.register(workspaceId, {
        handle: 'admin',
        password: 'password123',
      });
      const { inviteToken } = await authService.createInvite(workspaceId, admin.id, {
        handle: 'newuser',
      });
      expect(inviteToken.startsWith('inv_')).toBe(true);

      const result = await authService.acceptInvite(inviteToken, 'newuser-password');
      expect(result.principal.handle).toBe('newuser');
      expect(result.principal.is_active).toBe(true);
      expect(result.sessionId).toBeTruthy();
    });

    it('rejects invite from non-admin', async () => {
      const { principal: admin } = await authService.register(workspaceId, {
        handle: 'admin',
        password: 'password123',
      });
      await workspaces.update(workspaceId, { allow_registration: true, updated_at: new Date().toISOString() });
      const { principal: user } = await authService.register(workspaceId, {
        handle: 'user',
        password: 'password123',
      });
      await expect(
        authService.createInvite(workspaceId, user.id, { handle: 'newuser' }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects expired invite', async () => {
      const { principal: admin } = await authService.register(workspaceId, {
        handle: 'admin',
        password: 'password123',
      });
      const { principal: invited, inviteToken } = await authService.createInvite(workspaceId, admin.id, {
        handle: 'newuser',
      });
      // Expire the invite by setting the expiry to the past
      await principals.update(invited.id, {
        metadata_json: { invite_token_hash: sha256(inviteToken), invite_expires_at: new Date(0).toISOString() },
        updated_at: new Date().toISOString(),
      });
      await expect(
        authService.acceptInvite(inviteToken, 'newuser-password'),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('rejects invalid invite token', async () => {
      await authService.register(workspaceId, { handle: 'admin', password: 'password123' });
      await expect(
        authService.acceptInvite('inv_nonexistenttoken', 'password'),
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('agent token', () => {
    it('validates correct agent token', async () => {
      const token = generateToken('mat_');
      await workspaces.update(workspaceId, {
        agent_token_hash: sha256(token),
        updated_at: new Date().toISOString(),
      });
      const result = await authService.validateAgentToken(workspaceId, token);
      expect(result).toBe(true);
    });

    it('rejects wrong agent token', async () => {
      const token = generateToken('mat_');
      await workspaces.update(workspaceId, {
        agent_token_hash: sha256(token),
        updated_at: new Date().toISOString(),
      });
      const result = await authService.validateAgentToken(workspaceId, 'mat_wrongtoken');
      expect(result).toBe(false);
    });

    it('returns false when no agent token is set', async () => {
      const result = await authService.validateAgentToken(workspaceId, 'mat_anytoken');
      expect(result).toBe(false);
    });
  });

  describe('password reset', () => {
    it('resets password as admin', async () => {
      const { principal: admin } = await authService.register(workspaceId, {
        handle: 'admin',
        password: 'password123',
      });
      await workspaces.update(workspaceId, { allow_registration: true, updated_at: new Date().toISOString() });
      await authService.register(workspaceId, { handle: 'alice', password: 'old-password' });

      await authService.resetPassword(admin.id, 'alice', workspaceId, 'new-password');

      const result = await authService.login(workspaceId, 'alice', 'new-password');
      expect(result.principal.handle).toBe('alice');
    });

    it('rejects reset from non-admin', async () => {
      const { principal: admin } = await authService.register(workspaceId, {
        handle: 'admin',
        password: 'password123',
      });
      await workspaces.update(workspaceId, { allow_registration: true, updated_at: new Date().toISOString() });
      const { principal: user } = await authService.register(workspaceId, {
        handle: 'user',
        password: 'password123',
      });
      await expect(
        authService.resetPassword(user.id, 'admin', workspaceId, 'hacked'),
      ).rejects.toThrow(ForbiddenError);
    });

    it('invalidates existing sessions after reset', async () => {
      const { principal: admin } = await authService.register(workspaceId, {
        handle: 'admin',
        password: 'password123',
      });
      await workspaces.update(workspaceId, { allow_registration: true, updated_at: new Date().toISOString() });
      const { sessionId } = await authService.register(workspaceId, { handle: 'alice', password: 'old-password' });

      await authService.resetPassword(admin.id, 'alice', workspaceId, 'new-password');

      const result = await authService.validateSession(sessionId);
      expect(result).toBeNull();
    });
  });
});
