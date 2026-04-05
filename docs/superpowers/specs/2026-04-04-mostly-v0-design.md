# Mostly v0 Design Spec

Agent-first task tracking with a local-first core, an API-first shape, a strong CLI, and an MCP surface for AI agents.

## 1. Purpose

Mostly is a task system for humans and agents built around a small shared kernel: tasks, projects, principals, claims, and task updates. v0 is intentionally small. It works locally with SQLite, maps cleanly to PostgreSQL later, and is easy to drive from a CLI, API, and MCP tools.

## 2. Design decisions

Decisions made during brainstorming that refine or extend the original spec.

### 2.1 Single spec, phased build

One design document covers the full system. The implementation plan phases the work: core domain first, then storage, API server, CLI, MCP.

### 2.2 CLI-first milestone, CLI-as-API-client

The CLI is the first usable surface. However, the CLI always talks to a local HTTP API server rather than calling the domain layer in-process. This means even the CLI-first milestone requires a running server.

The server is started explicitly with `mostly serve`. No daemon mode in v0.

### 2.3 Response envelope

All API responses use a consistent envelope:

- Single resource: `{ data: T }`
- List: `{ data: { items: T[], next_cursor: string | null } }`
- Error: `{ error: { code: string, message: string, details?: Record<string, string> } }`

This deviates from the original spec which had `{ items, next_cursor }` at the top level. The envelope makes it unambiguous whether a response succeeded or failed.

### 2.4 Local auth

v0 uses a simple shared token for local API auth. The token is stored in `~/.mostly/config` and the CLI sends it as `Authorization: Bearer <token>`. No user-level auth, no sessions.

### 2.5 Database location

SQLite database lives at `~/.mostly/mostly.db`. One database, one workspace. Global to the user, not per-project.

## 3. Technology choices

| Concern | Choice |
|---------|--------|
| Language | TypeScript |
| Runtime | Node.js (Cloudflare Workers for deployment target) |
| HTTP framework | Hono |
| Database | Drizzle ORM with SQLite (local), Turso (hosted), D1 (Cloudflare) |
| CLI framework | Commander.js |
| Validation | Zod |
| Testing | Vitest |
| Build | tsup |
| Monorepo | pnpm workspaces |
| IDs | ULID |
| MCP SDK | @modelcontextprotocol/sdk (later phase) |

## 4. Architecture

### 4.1 Package structure

```
mostlylinear/
  pnpm-workspace.yaml
  tsconfig.base.json
  package.json

  packages/
    types/                   @mostly/types
    core/                    @mostly/core
    db/                      @mostly/db
    server/                  @mostly/server
    cli/                     @mostly/cli
    mcp/                     @mostly/mcp (later phase)
```

### 4.2 Package responsibilities

**@mostly/types** -- shared vocabulary. Zod schemas, inferred TypeScript types, enums, error classes. No internal dependencies beyond Zod.

**@mostly/core** -- domain logic. State machine, claim rules, key generation, repository interfaces, domain services. Depends on `@mostly/types`.

**@mostly/db** -- storage layer. Drizzle table definitions, migration files, repository implementations (implements interfaces from core), database adapters (local-sqlite, turso, cloudflare). Depends on `@mostly/types` and `@mostly/core`.

**@mostly/server** -- HTTP API. Hono app factory, route handlers, middleware (auth, actor resolution, error mapping). Depends on `@mostly/types`, `@mostly/core`, and `@mostly/db`.

**@mostly/cli** -- command-line interface. Commander.js commands, HTTP client wrapper, config reader, output formatting. Depends on `@mostly/types` for HTTP client commands. Also depends on `@mostly/server` and `@mostly/db` for the `mostly serve` and `mostly init` commands (which start and configure the local server). The CLI is the single entry point binary.

**@mostly/mcp** -- MCP server. Tools and resources that proxy to the HTTP API. Depends on `@mostly/types` only (it is an HTTP client).

### 4.3 Dependency graph

```
types  (no internal deps)
  ^
  |
core   (depends on types)
  ^
  |
db     (depends on types, core)
  ^
  |
server (depends on types, core, db)

cli    (depends on types for HTTP client commands;
        depends on server + db for 'serve' and 'init' commands)
mcp    (depends on types only -- HTTP client)
```

### 4.4 App factory pattern

The Hono app is constructed by a factory function that receives repository implementations:

```typescript
function createApp(deps: {
  tasks: TaskRepository;
  taskUpdates: TaskUpdateRepository;
  projects: ProjectRepository;
  principals: PrincipalRepository;
  workspaces: WorkspaceRepository;
  tx: TransactionManager;
  config: AppConfig;
}): Hono
```

Each deployment target (local, Turso, Cloudflare) wires different repository implementations into the same app. The domain logic is identical across targets.

## 5. Domain model

### 5.1 Enums

Defined as `as const` objects (not TS enums) for Zod compatibility and serialization.

**Principal kinds:** `human`, `agent`, `service`

**Task types:** `feature`, `bug`, `chore`, `research`, `incident`, `question`

**Task statuses:** `open`, `claimed`, `in_progress`, `blocked`, `closed`, `canceled`

**Resolutions:** `completed`, `duplicate`, `invalid`, `wont_do`, `deferred`

**Terminal statuses:** `closed`, `canceled`

**Resolution requirements:**
- `closed` requires resolution in `{completed, duplicate, invalid}`
- `canceled` requires resolution in `{wont_do, deferred}`
- Non-terminal states require `resolution = null`

**Task update kinds:**
- Principal-authored: `note`, `progress`, `plan`, `decision`, `handoff`, `result`
- Typically system-generated: `status`, `claim`, `system`

**Agent action context source kinds:** `cli_session`, `github_issue`, `github_pull_request`, `slack_message`, `webhook`, `api_request`

### 5.2 Entities

Six entities, matching the original spec exactly:

1. **workspace** -- id, slug, name, created_at, updated_at
2. **principal** -- id, workspace_id, handle, kind, display_name, metadata_json, is_active, created_at, updated_at
3. **project** -- id, workspace_id, key, name, description, is_archived, created_by_id, updated_by_id, created_at, updated_at
4. **task** -- id, workspace_id, project_id (nullable), key, type, title, description, status, resolution (nullable), assignee_id (nullable), claimed_by_id (nullable), claim_expires_at (nullable), version, created_by_id, updated_by_id, resolved_at (nullable), created_at, updated_at
5. **task_update** -- id, task_id, kind, body, metadata_json, created_by_id, created_at
6. **agent_action_context** -- id, task_update_id, principal_id, session_id (nullable), run_id (nullable), tool_name (nullable), tool_call_id (nullable), source_kind (nullable), source_ref (nullable), metadata_json, created_at

### 5.3 Identifiers

**Internal IDs:** ULID strings. Immutable. Source of truth for storage and APIs.

**Project keys:** Uppercase letters and digits, immutable, unique per workspace. Examples: `AUTH`, `OPS`, `PLAT`.

**Task keys:** System-generated, immutable, unique per workspace. Format: `{prefix}-{number}`. Prefix is the project key (or `TASK` if no project). Number is monotonically allocated per (workspace, prefix). Keys do not change when tasks move projects.

**Key sequence table:**

```sql
CREATE TABLE task_key_sequence (
  workspace_id TEXT NOT NULL,
  prefix       TEXT NOT NULL,
  next_number  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, prefix)
);
```

Allocation is atomic within a transaction.

### 5.4 Error classes

| Code | HTTP status | Meaning |
|------|-------------|---------|
| `not_found` | 404 | Entity does not exist |
| `invalid_argument` | 400 | Request validation failure |
| `conflict` | 409 | Optimistic concurrency version mismatch |
| `precondition_failed` | 412 | Business rule violation (invalid transition, claim conflict, etc.) |

Each error carries `code`, `message`, and optional `details` (field-level errors).

## 6. State machine

### 6.1 Allowed transitions

```
open        -> claimed, closed, canceled
claimed     -> in_progress, blocked, open, closed, canceled
in_progress -> blocked, open, closed, canceled
blocked     -> claimed, in_progress, open, closed, canceled
closed      (terminal)
canceled    (terminal)
```

### 6.2 Transition rules

1. Terminal states cannot transition.
2. `blocked` is only reachable from `claimed` or `in_progress`.
3. `blocked -> open`: only valid if task has an active claim (claimer is releasing and returning task to general availability). Claim is cleared as part of the transition.
4. `blocked -> claimed`: only valid if task has no active claim (someone picking it up).
5. `blocked -> in_progress`: requires an active claim.
6. Any transition to a terminal state requires no active claim at commit time.
7. If the acting principal is the active claimer, terminal transition plus claim release happens atomically.
8. If someone else holds the claim, terminal transition fails.

### 6.3 Validation function

`validateTransition(task, toStatus, resolution, actorId)` returns either:
- `{ valid: true, sideEffects: SideEffect[] }` describing what the transition implies (release claim, set resolved_at, etc.)
- `{ valid: false, error: DomainError }` with a specific error

## 7. Claim logic

### 7.1 Assignment vs. claim

Independent concepts. A task may be assigned and unclaimed, unassigned and claimed, or assigned to one principal and claimed by another. Assignment is planning. Claim is active execution.

### 7.2 Claim states

- **Active claim:** `claimed_by_id` is non-null AND (`claim_expires_at` is null OR in the future)
- **Expired claim:** `claimed_by_id` is non-null AND `claim_expires_at` is in the past
- **No claim:** `claimed_by_id` is null (requires `claim_expires_at` is also null)

Expired claims are treated as absent. Expiry enforcement is lazy in v0.

### 7.3 Claim operations

**Acquire:** Allowed when task is not terminal and has no active claim and status is `open` or `blocked`. Sets `claimed_by_id` and optionally `claim_expires_at`. If status was `open`, it becomes `claimed`. If status was `blocked`, it stays `blocked`. Increments version. Emits claim task_update.

**Renew:** Allowed only by current claimer. Updates `claim_expires_at`. Increments version. May emit claim task_update.

**Release:** Allowed only by current claimer. Clears `claimed_by_id` and `claim_expires_at`. If status was `claimed` or `in_progress`, becomes `open`. If `blocked`, stays `blocked`. Increments version. May emit claim task_update.

**Force release:** Operator-only recovery operation. Same effects as release but does not require the actor to be the current claimer. Emits system task_update. Authorization is out of scope for v0.

### 7.4 Pure validation functions

```
canAcquireClaim(task) -> boolean
canRenewClaim(task, actorId) -> boolean
canReleaseClaim(task, actorId) -> boolean
isClaimActive(task) -> boolean
isClaimExpired(task) -> boolean
```

## 8. Optimistic concurrency

Each task row has a `version` integer, starting at 1.

**Version increments on:** title, description, type, assignee, project, status, resolution, claim acquire/renew/release, lazy expiry cleanup, any other direct task-row mutation.

**Version does not increment on:** task_update inserts, agent_action_context inserts.

All task mutations require `expected_version`. The repository performs a conditional update: `UPDATE ... WHERE id = ? AND version = ?`. If zero rows are affected, the operation fails with `conflict` error.

## 9. Repository interfaces

Repository interfaces live in `@mostly/core/repositories/`. They define what services need from storage without coupling to any database library.

```typescript
interface TaskRepository {
  findById(id: string): Promise<Task | null>;
  findByKey(workspaceId: string, key: string): Promise<Task | null>;
  list(workspaceId: string, filters: TaskListFilters, cursor?: string, limit?: number): Promise<PaginatedResult<Task>>;
  create(data: TaskCreateData): Promise<Task>;
  update(id: string, data: TaskUpdateData, expectedVersion: number): Promise<Task>;
  nextKeyNumber(workspaceId: string, prefix: string): Promise<number>;
}

interface TaskUpdateRepository {
  list(taskId: string, cursor?: string, limit?: number): Promise<PaginatedResult<TaskUpdate>>;
  create(data: TaskUpdateCreateData): Promise<TaskUpdate>;
  createWithAgentContext(data: TaskUpdateCreateData, contexts: AgentActionContextCreateData[]): Promise<TaskUpdate>;
}

interface ProjectRepository {
  findById(id: string): Promise<Project | null>;
  findByKey(workspaceId: string, key: string): Promise<Project | null>;
  list(workspaceId: string, cursor?: string, limit?: number): Promise<PaginatedResult<Project>>;
  create(data: ProjectCreateData): Promise<Project>;
  update(id: string, data: ProjectPatchData): Promise<Project>;
}

interface PrincipalRepository {
  findById(id: string): Promise<Principal | null>;
  findByHandle(workspaceId: string, handle: string): Promise<Principal | null>;
  list(workspaceId: string, cursor?: string, limit?: number): Promise<PaginatedResult<Principal>>;
  create(data: PrincipalCreateData): Promise<Principal>;
  update(id: string, data: PrincipalPatchData): Promise<Principal>;
}

interface WorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findBySlug(slug: string): Promise<Workspace | null>;
  getDefault(): Promise<Workspace>;
  create(data: WorkspaceCreateData): Promise<Workspace>;
}

interface TransactionManager {
  withTransaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
```

**Pagination:** Cursor-based using ULID ordering. `WHERE id > :cursor ORDER BY id LIMIT :limit`. Cursor is the last item's ID, opaque to the client.

## 10. Domain services

Services in `@mostly/core/services/` orchestrate business logic. They take repository interfaces as constructor dependencies.

### 10.1 TaskService

```typescript
class TaskService {
  constructor(
    tasks: TaskRepository,
    taskUpdates: TaskUpdateRepository,
    projects: ProjectRepository,
    tx: TransactionManager,
  )

  // CRUD
  create(workspaceId, input, actorId): Promise<Task>
  get(id): Promise<Task>
  getByKey(workspaceId, key): Promise<Task>
  list(workspaceId, filters, cursor?): Promise<PaginatedResult<Task>>
  update(id, input, expectedVersion, actorId): Promise<Task>

  // State transitions
  transition(id, toStatus, resolution, expectedVersion, actorId): Promise<Task>

  // Claims
  acquireClaim(id, actorId, expiresAt, expectedVersion): Promise<Task>
  renewClaim(id, actorId, expiresAt, expectedVersion): Promise<Task>
  releaseClaim(id, actorId, expectedVersion): Promise<Task>

  // Task updates
  addUpdate(taskId, input, actorId): Promise<TaskUpdate>
  listUpdates(taskId, cursor?): Promise<PaginatedResult<TaskUpdate>>
}
```

**Create flow:**
1. Resolve project (if provided) to get key prefix, otherwise use `TASK`
2. Allocate next key number atomically within a transaction
3. Insert task with status `open`, version 1
4. Return created task

**Transition flow:**
1. Fetch task
2. Lazy-check claim expiry (clear if expired)
3. Validate transition via state machine
4. If terminal + actor is claimer: atomically release claim + transition
5. If terminal + someone else holds claim: fail
6. Apply side effects (resolved_at, claim fields, etc.)
7. Increment version, conditional update with expectedVersion
8. Emit system task_update

**Acquire claim flow:**
1. Fetch task
2. Lazy-check claim expiry
3. Validate with canAcquireClaim
4. Set claimed_by_id, optionally claim_expires_at
5. If status was `open`, change to `claimed`
6. Increment version, conditional update
7. Emit claim task_update

### 10.2 ProjectService

CRUD with uniqueness validation on project key per workspace. Archived projects reject new tasks unless explicitly allowed.

### 10.3 PrincipalService

CRUD with uniqueness validation on handle per workspace.

### 10.4 MaintenanceService

`reapExpiredClaims(workspaceId)`: finds all tasks where `claim_expires_at < now()`, clears claim fields, adjusts status per release rules, emits system updates. Returns count of reaped claims.

## 11. Database schema

### 11.1 Storage conventions

- IDs: ULID strings, generated at application layer
- Timestamps: ISO 8601 text (SQLite TEXT type), always UTC
- Enums: stored as TEXT, validated at application layer
- metadata_json: stored as TEXT (JSON string) in SQLite; JSONB in PostgreSQL later
- version: INTEGER, incremented by application (not triggers)
- Foreign keys: explicit where supported

### 11.2 Drizzle schema

Tables defined in `@mostly/db/schema/`, one file per entity. Maps 1:1 to the entity model in section 5.2.

### 11.3 Indexes

```sql
-- Required
CREATE UNIQUE INDEX idx_principal_workspace_handle ON principal(workspace_id, handle);
CREATE UNIQUE INDEX idx_project_workspace_key ON project(workspace_id, key);
CREATE UNIQUE INDEX idx_task_workspace_key ON task(workspace_id, key);
CREATE INDEX idx_task_project ON task(project_id);
CREATE INDEX idx_task_status ON task(status);
CREATE INDEX idx_task_assignee ON task(assignee_id);
CREATE INDEX idx_task_claimed_by ON task(claimed_by_id);
CREATE INDEX idx_task_update_task_created ON task_update(task_id, created_at);
CREATE INDEX idx_agent_action_ctx_update_created ON agent_action_context(task_update_id, created_at);

-- Claim-heavy workflows
CREATE INDEX idx_task_claim_expiry ON task(claimed_by_id, claim_expires_at);
```

### 11.4 Adapters

Three database adapters in `@mostly/db/adapters/`:

- **local-sqlite.ts** -- uses `better-sqlite3`, path `~/.mostly/mostly.db`
- **turso.ts** -- uses `@libsql/client`, connects to Turso URL
- **cloudflare.ts** -- uses Cloudflare D1 binding

Each returns a Drizzle instance used by repository implementations.

### 11.5 Migrations

Drizzle Kit generates migration files in `@mostly/db/migrations/`. `mostly serve` runs pending migrations on startup. A `mostly migrate` CLI command is available for explicit migration.

### 11.6 Workspace seeding

On first run, if no workspace exists, the server creates a default workspace (slug: `default`, name: `Default`). Zero-config for local use.

## 12. API server

### 12.1 Routes

All routes under `/v0`. Single-workspace (no workspace ID in path).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v0/principals` | List principals |
| POST | `/v0/principals` | Create principal |
| GET | `/v0/principals/:id` | Get principal |
| PATCH | `/v0/principals/:id` | Update principal |
| GET | `/v0/projects` | List projects |
| POST | `/v0/projects` | Create project |
| GET | `/v0/projects/:id` | Get project |
| PATCH | `/v0/projects/:id` | Update project |
| GET | `/v0/tasks` | List tasks (filterable by status, assignee, project, claimed_by) |
| POST | `/v0/tasks` | Create task |
| GET | `/v0/tasks/:id` | Get task |
| PATCH | `/v0/tasks/:id` | Update task fields |
| POST | `/v0/tasks/:id/transition` | Status transition |
| POST | `/v0/tasks/:id/claim` | Acquire claim |
| POST | `/v0/tasks/:id/renew-claim` | Renew claim |
| POST | `/v0/tasks/:id/release-claim` | Release claim |
| GET | `/v0/tasks/:id/updates` | List task updates |
| POST | `/v0/tasks/:id/updates` | Add task update |
| POST | `/v0/maintenance/reap-expired-claims` | Reap expired claims |

**ID/key resolution:** The `:id` parameter accepts both ULIDs and human-readable keys (e.g., `AUTH-12`). Route handlers detect the format and resolve accordingly.

### 12.2 Middleware

- **Auth** -- validates `Authorization: Bearer <token>` against shared token from config. Returns 401 if invalid.
- **Actor resolution** -- resolves acting principal from `actor_id` or `actor_handle` in request body/query. Validates principal exists and is active. Fails if no actor can be resolved.
- **Error handling** -- catches domain errors and maps to JSON error responses with appropriate HTTP status codes.

### 12.3 Request validation

Each route validates request body and parameters with Zod schemas from `@mostly/types`. Invalid input returns 400 with field-level error details.

### 12.4 Local server entry point

`@mostly/server/serve.ts` wires the local-sqlite adapter, repository implementations, and app factory. Starts a Node.js HTTP server on a configurable port (default: 6080). Reads config from `~/.mostly/config`.

## 13. CLI

### 13.1 Binary and configuration

Binary name: `mostly`

Configuration file: `~/.mostly/config` (JSON)
- `server_url` -- default `http://localhost:6080`
- `token` -- shared secret for auth
- `default_actor` -- principal handle

Actor resolution order:
1. `--actor` flag
2. `MOSTLY_ACTOR` env var
3. `default_actor` in config
4. Fail with clear error

### 13.2 Initialization

`mostly init` sets up the local environment:
1. Creates `~/.mostly/` directory if it does not exist
2. Generates a random auth token
3. Writes `~/.mostly/config` with default settings (server_url, token, default_actor if provided)
4. Runs database migrations (creates `~/.mostly/mostly.db`)
5. Seeds the default workspace

If `~/.mostly/config` already exists, `init` exits with a message. Use `--force` to overwrite.

`mostly serve` checks for config and prompts the user to run `mostly init` if it does not exist.

### 13.3 Commands

```
mostly init [--default-actor <handle>] [--force]  Initialize ~/.mostly/ config and DB
mostly serve                                      Start local API server

mostly project create --key --name [--description]
mostly project list
mostly project show <key-or-id>

mostly principal create --handle --kind [--display-name]
mostly principal list
mostly principal show <handle-or-id>

mostly task create --title --type [--project] [--description] [--assignee]
mostly task list [--status] [--assignee] [--project] [--claimed-by]
mostly task show <key-or-id>
mostly task edit <key-or-id> [--title] [--description] [--type] [--assignee] [--project]
mostly task claim <key-or-id> [--ttl <duration>]
mostly task renew-claim <key-or-id> [--ttl <duration>]
mostly task release-claim <key-or-id>
mostly task start <key-or-id>                     # claimed -> in_progress
mostly task block <key-or-id> [--body <reason>]   # -> blocked, optionally adds update
mostly task close <key-or-id> [--resolution]      # default: completed
mostly task cancel <key-or-id> [--resolution]     # default: wont_do
mostly task add-update <key-or-id> --kind --body [--metadata-json]
mostly task reap-expired
```

### 13.4 HTTP client

Thin wrapper that injects auth header, manages base URL, parses error responses, and handles JSON serialization. All commands call through this client.

### 13.5 Output formatting

- Default: human-readable table (list) or formatted card (show)
- `--json`: raw JSON for programmatic use
- `--quiet`: minimal output (IDs or keys only)

### 13.6 Convenience commands

`start`, `block`, `close`, `cancel` are wrappers over the `/transition` endpoint with preset `to_status` and default resolutions. `block` also creates a task update with the reason if `--body` is provided.

## 14. MCP surface (later phase)

### 14.1 Architecture

The MCP server is an HTTP client to the Mostly API, like the CLI. Uses `@modelcontextprotocol/sdk`. Same config as CLI for server URL and token.

### 14.2 Tools

| Tool | API endpoint |
|------|-------------|
| `mostly.list_tasks` | GET /v0/tasks |
| `mostly.get_task` | GET /v0/tasks/:id |
| `mostly.create_task` | POST /v0/tasks |
| `mostly.edit_task` | PATCH /v0/tasks/:id |
| `mostly.transition_task` | POST /v0/tasks/:id/transition |
| `mostly.claim_task` | POST /v0/tasks/:id/claim |
| `mostly.renew_claim` | POST /v0/tasks/:id/renew-claim |
| `mostly.release_claim` | POST /v0/tasks/:id/release-claim |
| `mostly.add_task_update` | POST /v0/tasks/:id/updates |
| `mostly.list_projects` | GET /v0/projects |
| `mostly.get_project` | GET /v0/projects/:id |
| `mostly.list_principals` | GET /v0/principals |
| `mostly.reap_expired_claims` | POST /v0/maintenance/reap-expired-claims |

### 14.3 Resources

URI scheme:
- `task://{workspace_slug}/{task_key}`
- `project://{workspace_slug}/{project_key}`
- `principal://{workspace_slug}/{principal_handle}`

MCP resource identifiers are convenience identifiers. The MCP layer resolves slugs, keys, and handles to immutable internal IDs. Tools accept either stable IDs or human-friendly identifiers. Responses include both.

## 15. Automatic system updates

Recommended system-generated task updates for auditability:

- Claim acquired
- Claim renewed
- Claim released
- Claim force-released
- Claim expired and lazily cleared
- Status transitioned
- Resolution set on terminal transition
- Assignee changed

## 16. Testing strategy

### 16.1 Layer-appropriate testing

**@mostly/core** -- unit tests with in-memory fake repositories. Covers state machine, claim logic, service orchestration, key generation, all spec invariants. No DB needed.

**@mostly/db** -- integration tests with real in-memory SQLite. Covers Drizzle queries, migrations, optimistic concurrency at SQL level, key sequence atomicity.

**@mostly/server** -- API tests using Hono test client. Full request/response cycle with real repositories and in-memory SQLite. Covers route validation, error responses, auth, actor resolution.

**@mostly/cli** -- tests for command parsing and output formatting. Integration tests against real API server or Hono test client.

### 16.2 High-priority coverage

- Every state transition (valid and invalid)
- Every claim rule (acquire, renew, release, expiry, force-release)
- Optimistic concurrency conflicts
- Resolution requirements per terminal state
- Key generation monotonicity
- Blocked task transition edge cases

### 16.3 Test utilities

Shared factory functions for creating test entities: `makeTask()`, `makeProject()`, `makePrincipal()`, etc.

## 17. Build phases

### Phase 1: Foundation
- Monorepo setup (pnpm workspaces, tsconfig, tsup, vitest)
- `@mostly/types` -- all enums, Zod schemas, error classes
- `@mostly/core` -- state machine, claim logic, key generation, repository interfaces, services
- Core unit tests with in-memory fakes

### Phase 2: Storage
- `@mostly/db` -- Drizzle schema, migrations, local-sqlite adapter, repository implementations
- DB integration tests
- Key sequence table and atomic allocation

### Phase 3: API server
- `@mostly/server` -- Hono app factory, routes, middleware (auth, actor, errors)
- API integration tests with Hono test client
- `serve` entry point with auto-migration and workspace seeding

### Phase 4: CLI
- `@mostly/cli` -- Commander.js commands, HTTP client, config, output formatting
- `mostly serve` command
- All task, project, principal commands
- CLI integration tests

### Phase 5: MCP
- `@mostly/mcp` -- MCP SDK tools and resources
- MCP integration tests

### Phase 6: Additional adapters (stretch)
- Turso adapter
- Cloudflare adapter

Each phase produces a usable artifact. After Phase 4, you have a fully working local task system.

## 18. Non-goals for v0

Explicitly deferred:
- Workflows, automations, or checks
- Runs, artifacts, or execution logs as first-class entities
- Boards, sprints, milestones, or labels
- Fine-grained permissions or RBAC
- Multi-workspace routing in the public API
- Linked external identities per principal
- Notifications
- Background workers as a hard requirement
- Arbitrary event streaming
- Task priority
- Parent-child task hierarchies
