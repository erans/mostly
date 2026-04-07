# User Authentication & Sign-Up — Design Spec

**Date:** 2026-04-06
**Status:** Implemented (2026-04-07)

## Purpose

Add per-user authentication to Mostly. Today, a single shared Bearer token authenticates all requests and principals self-declare their identity. This design introduces password-based login for humans, personal API keys for CLI access, and a shared agent token for agents — so the server knows *who* is making each request.

## Scope

This covers:

- Password-based registration and login for human users (web + CLI)
- Session cookies for web frontend authentication
- Multiple named API keys per human user (CLI/API access)
- Shared workspace agent token for all agent principals
- First-user open registration, then invite-only (configurable)
- Admin role (is_admin flag) for user management
- Admin password reset via CLI

Out of scope: OAuth/OIDC, email-based password reset, rate limiting, per-agent tokens, RBAC beyond admin/non-admin, two-factor auth, email field on principals.

## Authentication Model

Three authentication methods:

| Method | Who | Mechanism |
|--------|-----|-----------|
| Password + session cookie | Humans on web | POST /v0/auth/login sets httpOnly cookie |
| API key | Humans on CLI/API | Bearer token in Authorization header, key tied to a principal |
| Agent token | All agents (shared) | Bearer token in Authorization header, workspace-level, agents self-identify via actor_handle |

The auth middleware tries each method in order: session cookie → API key → agent token. Once authenticated, the server resolves the principal — no more self-declared `actor_handle` for humans.

For agents, the current `actor_handle` self-declaration continues since they share one token.

## Schema Changes

### Modified: `principal` table

Two new columns:

| Column | Type | Notes |
|--------|------|-------|
| `password_hash` | `TEXT` | bcrypt hash, null for agents |
| `is_admin` | `INTEGER DEFAULT false` | Controls invite/management permissions |

### New: `session` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `TEXT PRIMARY KEY` | `sess_<random>` |
| `principal_id` | `TEXT NOT NULL` | FK to principal |
| `workspace_id` | `TEXT NOT NULL` | FK to workspace |
| `expires_at` | `TEXT NOT NULL` | ISO 8601, 7-day TTL, sliding |
| `created_at` | `TEXT NOT NULL` | |

### New: `api_key` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `TEXT PRIMARY KEY` | `key_<random>` |
| `principal_id` | `TEXT NOT NULL` | FK to principal |
| `workspace_id` | `TEXT NOT NULL` | FK to workspace |
| `name` | `TEXT NOT NULL` | User-chosen label ("laptop", "ci") |
| `key_hash` | `TEXT NOT NULL` | SHA-256 hash of the full key |
| `key_prefix` | `TEXT NOT NULL` | First 8 chars, for display |
| `is_active` | `INTEGER DEFAULT true` | Soft revoke |
| `created_at` | `TEXT NOT NULL` | |
| `last_used_at` | `TEXT` | Updated on each use |

Unique constraint: `(principal_id, name)` — key names unique per user.

### Modified: `workspace` table

Two new columns:

| Column | Type | Notes |
|--------|------|-------|
| `agent_token_hash` | `TEXT` | SHA-256 hash of the shared agent token |
| `allow_registration` | `INTEGER DEFAULT false` | Config flag for open registration |

## Auth Endpoints

### Unauthenticated routes

| Endpoint | Purpose |
|----------|---------|
| `POST /v0/auth/register` | First-user signup or open registration. Takes `handle`, `password`, `display_name?`. First user becomes admin. Returns principal info + sets session cookie. |
| `POST /v0/auth/login` | Takes `handle`, `password`. Sets httpOnly session cookie, returns principal info. |
| `POST /v0/auth/accept-invite` | Takes invite token + password. Sets password on pre-created principal, sets session cookie. |

### Authenticated routes

| Endpoint | Purpose |
|----------|---------|
| `GET /v0/auth/me` | Returns current principal from session/API key. |
| `POST /v0/auth/logout` | Clears session cookie, deletes session row. |
| `POST /v0/auth/api-keys` | Create a named API key. Returns the full key once. |
| `GET /v0/auth/api-keys` | List current user's keys (name, prefix, created_at, last_used_at). Never returns full key. |
| `DELETE /v0/auth/api-keys/:id` | Revoke a key. |
| `POST /v0/auth/invite` | Admin-only. Creates a principal with a one-time invite token in metadata. Returns invite token. |

### Existing routes

All existing `/v0/*` routes continue to require authentication. The auth middleware changes from checking one shared token to the three-method resolution described above.

## Auth Middleware

The middleware is rewritten to resolve authentication from multiple sources:

1. **Session cookie** — look for `mostly_session` cookie → look up `session` table → validate not expired → resolve principal. Slide expiry on each request.
2. **Bearer token — API key** — extract token from `Authorization: Bearer <token>` → SHA-256 hash it → look up `api_key` table by hash → validate `is_active` → resolve principal. Update `last_used_at`.
3. **Bearer token — agent token** — SHA-256 hash the token → compare with `workspace.agent_token_hash` → if match, resolve actor from `actor_handle` in request body (agent flow, same as today).
4. **No match** → 401 Unauthorized.

For humans (resolved via session or API key), the server sets `actorId` from the authenticated principal. The `actor_handle`/`actor_id` fields in request bodies are ignored for human-authenticated requests.

For agents (resolved via agent token), the existing `actorMiddleware` behavior continues — `actor_handle` from the body is required and resolved.

## Session Details

- Cookie name: `mostly_session`
- Flags: `httpOnly`, `SameSite=Lax`, `Secure` when not localhost, `Path=/`
- TTL: 7 days, sliding expiry (refreshed on each request)
- Storage: `session` table in SQLite

## Password & Key Formats

**Password hashing:** bcrypt, cost factor 12.

**Key formats:**

| Credential | Prefix | Format | Storage |
|-----------|--------|--------|---------|
| API key | `msk_` | 32 random bytes, hex | SHA-256 hash in `api_key.key_hash`, first 8 chars in `key_prefix` |
| Agent token | `mat_` | 32 random bytes, hex | SHA-256 hash in `workspace.agent_token_hash` |
| Session ID | `sess_` | 32 random bytes, hex | Stored directly in `session.id` (server-side only) |
| Invite token | `inv_` | 32 random bytes, hex | Stored in principal `metadata_json`, cleared on accept |

API keys and agent tokens are hashed at rest because they're long-lived secrets stored on user machines. Session IDs are short-lived and server-side only, so they're stored directly.

## Registration Flow

1. **First user:** `POST /v0/auth/register` checks if any human principals exist. If none, the request succeeds and the new principal gets `is_admin=true`. No token or prior auth required.
2. **Subsequent users (invite):** Admin calls `POST /v0/auth/invite` with a handle → server creates an inactive principal (`is_active=false`) with an invite token and expiry (7 days) in `metadata_json` → admin shares the invite token → invitee calls `POST /v0/auth/accept-invite` with token + password → principal becomes active with password set, invite metadata cleared. Expired invites are rejected; the admin can re-invite.
3. **Open registration:** If `workspace.allow_registration` is true, `POST /v0/auth/register` accepts new users without an invite. They get `is_admin=false`.

## Web Frontend Changes

### Replace setup screen with login/register

- **Login page** (`/login`) — handle + password form. On success, session cookie is set, redirect to `/tasks/my`.
- **Register page** (`/register`) — handle + password + display name. Accessible when no users exist or `allow_registration` is enabled. Auto-login on success.
- **Accept invite page** (`/invite/:token`) — set password for an invited account. Auto-login on success.

### Config simplification

The `use-config` hook changes from `{ serverUrl, token, principalHandle }` to just `{ serverUrl }`. The session cookie handles identity. `apiFetch` stops sending `Authorization: Bearer` — the browser sends the cookie automatically. Mutations no longer inject `actor_handle`.

### Auth state

A new `useAuth` hook calls `GET /v0/auth/me` to get the current principal. If unauthorized, redirect to `/login`. The hook provides the current user's info to the rest of the app.

### New UI

- Sidebar user section: logged-in user's handle, dropdown with "API Keys", "Logout"
- Admin users also see: "Invite User" option
- API Keys page: list keys, create new (name input, shows key once), revoke
- Route guards: unauthenticated → `/login`, `/register` only when allowed

## CLI Changes

### `mostly init` (modified)

1. Creates DB + runs migrations (same as today)
2. Seeds workspace (same)
3. Prompts for admin handle + password → creates first principal with `is_admin=true` and bcrypt-hashed password
4. Generates workspace agent token → stores SHA-256 hash in workspace table
5. Writes config: `{ server_url, agent_token }` — the agent token is shown once
6. Prints setup summary

### New commands

| Command | Purpose |
|---------|---------|
| `mostly login` | Prompts for handle + password. Creates API key named `cli-<hostname>`, stores in config. |
| `mostly logout` | Removes API key from config, revokes on server. |
| `mostly api-key create <name>` | Create a named API key, print once. |
| `mostly api-key list` | List keys (name, prefix, last used). |
| `mostly api-key revoke <name>` | Revoke a key. |
| `mostly invite <handle>` | Admin-only. Creates invite, prints token/URL. |
| `mostly principal reset-password <handle>` | Admin-only. Prompts for new password, updates hash. |

### Config file

`~/.mostly/config` changes from `{ server_url, token, default_actor }` to:

```json
{
  "server_url": "http://localhost:6080",
  "api_key": "msk_...",
  "agent_token": "mat_..."
}
```

CLI uses `api_key` if set (human auth, principal resolved server-side). Falls back to `agent_token` if only that is set (requires `--actor` flag, same as today).

## Migration Strategy

This is a breaking change. The migration:

1. Adds `password_hash` and `is_admin` columns to `principal` table
2. Adds `agent_token_hash` and `allow_registration` columns to `workspace` table
3. Creates `session` and `api_key` tables
4. Existing principals with `kind=human` will have null `password_hash` — they must set a password via CLI admin reset or re-registration
5. The old shared workspace token in `~/.mostly/config` stops being accepted — users must run `mostly init` again or manually set up the new auth
