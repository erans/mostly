import { hash, compare } from 'bcryptjs';
import { timingSafeEqual } from 'crypto';
import {
  generateId, ID_PREFIXES,
  InvalidArgumentError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError,
} from '@mostly/types';
import type { Principal, Session, ApiKey } from '@mostly/types';
import { generateToken, sha256, SESSION_TTL_MS, INVITE_TTL_MS } from '../crypto.js';
import type { PrincipalRepository, WorkspaceRepository, SessionRepository, ApiKeyRepository } from '../repositories/index.js';

const BCRYPT_ROUNDS = 12;

export class AuthService {
  constructor(
    private principals: PrincipalRepository,
    private workspaces: WorkspaceRepository,
    private sessions: SessionRepository,
    private apiKeys: ApiKeyRepository,
  ) {}

  // --- Registration ---

  async register(
    workspaceId: string,
    input: { handle: string; password: string; display_name?: string },
  ): Promise<{ principal: Principal; sessionId: string }> {
    const humans = await this.principals.listHumans(workspaceId);
    const isFirstUser = humans.length === 0;

    if (!isFirstUser) {
      const ws = await this.workspaces.findById(workspaceId);
      if (!ws) throw new NotFoundError('workspace', workspaceId);
      if (!ws.allow_registration) {
        throw new ForbiddenError('Registration is not open. Ask an admin for an invite.');
      }
    }

    const existing = await this.principals.findByHandle(workspaceId, input.handle);
    if (existing) throw new ConflictError(`Handle "${input.handle}" is already taken`);

    const passwordHash = await hash(input.password, BCRYPT_ROUNDS);
    const now = new Date().toISOString();

    const principal = await this.principals.create({
      id: generateId(ID_PREFIXES.principal),
      workspace_id: workspaceId,
      handle: input.handle,
      kind: 'human',
      display_name: input.display_name ?? null,
      metadata_json: null,
      password_hash: passwordHash,
      is_active: true,
      is_admin: isFirstUser,
      created_at: now,
      updated_at: now,
    });

    const sessionId = await this.createSession(principal.id, workspaceId);
    return { principal, sessionId };
  }

  // --- Login ---

  async login(
    workspaceId: string,
    handle: string,
    password: string,
  ): Promise<{ principal: Principal; sessionId: string }> {
    const principal = await this.principals.findByHandle(workspaceId, handle);
    if (!principal) throw new UnauthorizedError('Invalid handle or password');
    if (!principal.is_active) throw new UnauthorizedError('Account is disabled');
    if (principal.kind !== 'human') throw new UnauthorizedError('Invalid handle or password');

    const storedHash = await this.principals.getPasswordHash(principal.id);
    if (!storedHash) throw new UnauthorizedError('Invalid handle or password');

    const valid = await compare(password, storedHash);
    if (!valid) throw new UnauthorizedError('Invalid handle or password');

    const sessionId = await this.createSession(principal.id, workspaceId);
    return { principal, sessionId };
  }

  // --- Sessions ---

  async createSession(principalId: string, workspaceId: string): Promise<string> {
    const sessionId = generateToken('sess_');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    await this.sessions.create({
      id: sessionId,
      principal_id: principalId,
      workspace_id: workspaceId,
      expires_at: expiresAt.toISOString(),
      created_at: now.toISOString(),
    });

    return sessionId;
  }

  async validateSession(sessionId: string): Promise<{ principal: Principal; workspaceId: string } | null> {
    const session = await this.sessions.findById(sessionId);
    if (!session) return null;

    if (new Date(session.expires_at) <= new Date()) {
      await this.sessions.delete(sessionId);
      return null;
    }

    const principal = await this.principals.findById(session.principal_id);
    if (!principal || !principal.is_active) {
      await this.sessions.delete(sessionId);
      return null;
    }

    // Slide expiry
    const newExpiry = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await this.sessions.updateExpiresAt(sessionId, newExpiry);

    return { principal, workspaceId: session.workspace_id };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessions.delete(sessionId);
  }

  // --- API Keys ---

  async createApiKey(
    principalId: string,
    workspaceId: string,
    name: string,
  ): Promise<{ apiKey: ApiKey; fullKey: string }> {
    const existing = await this.apiKeys.findByPrincipalAndName(principalId, name);
    if (existing) throw new ConflictError(`API key named "${name}" already exists`);

    const fullKey = generateToken('msk_');
    const keyHash = sha256(fullKey);
    const keyPrefix = fullKey.slice(4, 12); // 8 chars after 'msk_'
    const now = new Date().toISOString();

    const apiKey = await this.apiKeys.create({
      id: generateId(ID_PREFIXES.apiKey),
      principal_id: principalId,
      workspace_id: workspaceId,
      name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      is_active: true,
      created_at: now,
      last_used_at: null,
    });

    return { apiKey, fullKey };
  }

  async validateApiKey(token: string): Promise<{ principal: Principal; workspaceId: string } | null> {
    const keyHash = sha256(token);
    const record = await this.apiKeys.findByHash(keyHash);
    if (!record || !record.is_active) return null;

    const principal = await this.principals.findById(record.principal_id);
    if (!principal || !principal.is_active) return null;

    // Update last_used_at (fire-and-forget)
    this.apiKeys.updateLastUsed(record.id, new Date().toISOString()).catch(() => {});

    return { principal, workspaceId: record.workspace_id };
  }

  async listApiKeys(principalId: string): Promise<ApiKey[]> {
    return this.apiKeys.listByPrincipal(principalId);
  }

  async revokeApiKey(id: string, principalId: string): Promise<void> {
    const keys = await this.apiKeys.listByPrincipal(principalId);
    const key = keys.find((k) => k.id === id);
    if (!key) throw new NotFoundError('api_key', id);
    await this.apiKeys.deactivate(id);
  }

  // --- Agent token ---

  async validateAgentToken(workspaceId: string, token: string): Promise<boolean> {
    const storedHash = await this.workspaces.getAgentTokenHash(workspaceId);
    if (!storedHash) return false;
    const computed = sha256(token);
    if (computed.length !== storedHash.length) return false;
    return timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
  }

  // --- Invites ---

  async createInvite(
    workspaceId: string,
    adminPrincipalId: string,
    input: { handle: string; display_name?: string },
  ): Promise<{ principal: Principal; inviteToken: string }> {
    const admin = await this.principals.findById(adminPrincipalId);
    if (!admin || !admin.is_admin) throw new ForbiddenError('Only admins can create invites');

    const existing = await this.principals.findByHandle(workspaceId, input.handle);
    if (existing) throw new ConflictError(`Handle "${input.handle}" is already taken`);

    const inviteToken = generateToken('inv_');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
    const now = new Date().toISOString();

    const principal = await this.principals.create({
      id: generateId(ID_PREFIXES.principal),
      workspace_id: workspaceId,
      handle: input.handle,
      kind: 'human',
      display_name: input.display_name ?? null,
      metadata_json: { invite_token_hash: sha256(inviteToken), invite_expires_at: expiresAt },
      password_hash: null,
      is_active: false,
      is_admin: false,
      created_at: now,
      updated_at: now,
    });

    return { principal, inviteToken };
  }

  async acceptInvite(
    token: string,
    password: string,
  ): Promise<{ principal: Principal; sessionId: string }> {
    const tokenHash = sha256(token);

    // Get default workspace and scan for the invite
    const workspace = await this.workspaces.getDefault();
    const allHumans = await this.principals.listHumans(workspace.id);

    let targetPrincipal: Principal | null = null;
    for (const p of allHumans) {
      const meta = p.metadata_json;
      if (meta && typeof meta === 'object' && 'invite_token_hash' in meta && meta.invite_token_hash === tokenHash) {
        targetPrincipal = p;
        break;
      }
    }

    if (!targetPrincipal) throw new UnauthorizedError('Invalid or expired invite token');

    // Check expiry
    const meta = targetPrincipal.metadata_json;
    if (!meta || typeof meta !== 'object' || !('invite_expires_at' in meta) || typeof meta.invite_expires_at !== 'string') {
      throw new UnauthorizedError('Invalid or expired invite token');
    }
    const expiresAt = meta.invite_expires_at;
    if (new Date(expiresAt) <= new Date()) {
      throw new UnauthorizedError('Invite token has expired');
    }

    // Set password and activate
    const passwordHash = await hash(password, BCRYPT_ROUNDS);
    const now = new Date().toISOString();
    const updated = await this.principals.update(targetPrincipal.id, {
      password_hash: passwordHash,
      is_active: true,
      metadata_json: null, // Clear invite metadata
      updated_at: now,
    });

    const sessionId = await this.createSession(updated.id, workspace.id);
    return { principal: updated, sessionId };
  }

  // --- Password reset (admin) ---

  async resetPassword(adminPrincipalId: string, targetHandle: string, workspaceId: string, newPassword: string): Promise<void> {
    const admin = await this.principals.findById(adminPrincipalId);
    if (!admin || !admin.is_admin) throw new ForbiddenError('Only admins can reset passwords');

    const target = await this.principals.findByHandle(workspaceId, targetHandle);
    if (!target) throw new NotFoundError('principal', targetHandle);
    if (target.kind !== 'human') throw new InvalidArgumentError('Can only reset passwords for human principals');

    const passwordHash = await hash(newPassword, BCRYPT_ROUNDS);
    await this.principals.update(target.id, {
      password_hash: passwordHash,
      updated_at: new Date().toISOString(),
    });

    // Invalidate all sessions for this user
    await this.sessions.deleteByPrincipalId(target.id);
  }
}
