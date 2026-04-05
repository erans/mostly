import type { Workspace, Principal, Project, Task, TaskUpdate } from '@mostly/types';
import { ConflictError, NotFoundError } from '@mostly/types';
import type {
  WorkspaceRepository, WorkspaceCreateData,
  PrincipalRepository, PrincipalCreateData, PrincipalPatchData,
  ProjectRepository, ProjectCreateData, ProjectPatchData,
  TaskRepository, TaskCreateData, TaskUpdateData,
  TaskUpdateRepository, TaskUpdateCreateData, AgentActionContextCreateData,
  TransactionManager, TransactionContext,
  PaginatedResult, TaskListFilters,
} from '../repositories/index.js';

function paginate<T extends { id: string }>(
  items: T[],
  cursor?: string,
  limit: number = 50,
): PaginatedResult<T> {
  let filtered = items;
  if (cursor) {
    const idx = items.findIndex((i) => i.id === cursor);
    filtered = idx >= 0 ? items.slice(idx + 1) : items;
  }
  const page = filtered.slice(0, limit);
  return {
    items: page,
    next_cursor: page.length === limit && filtered.length > limit ? page[page.length - 1].id : null,
  };
}

export class FakeWorkspaceRepository implements WorkspaceRepository {
  private store = new Map<string, Workspace>();

  async findById(id: string): Promise<Workspace | null> {
    return this.store.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<Workspace | null> {
    for (const ws of this.store.values()) {
      if (ws.slug === slug) return ws;
    }
    return null;
  }

  async getDefault(): Promise<Workspace> {
    for (const ws of this.store.values()) return ws;
    throw new NotFoundError('workspace', 'default');
  }

  async create(data: WorkspaceCreateData): Promise<Workspace> {
    const ws: Workspace = { ...data };
    this.store.set(ws.id, ws);
    return ws;
  }
}

export class FakePrincipalRepository implements PrincipalRepository {
  private store = new Map<string, Principal>();

  async findById(id: string): Promise<Principal | null> {
    return this.store.get(id) ?? null;
  }

  async findByHandle(workspaceId: string, handle: string): Promise<Principal | null> {
    for (const p of this.store.values()) {
      if (p.workspace_id === workspaceId && p.handle === handle) return p;
    }
    return null;
  }

  async list(workspaceId: string, cursor?: string, limit?: number): Promise<PaginatedResult<Principal>> {
    const items = [...this.store.values()].filter((p) => p.workspace_id === workspaceId);
    return paginate(items, cursor, limit);
  }

  async create(data: PrincipalCreateData): Promise<Principal> {
    const p = { ...data, metadata_json: data.metadata_json ?? null } as Principal;
    this.store.set(p.id, p);
    return p;
  }

  async update(id: string, data: PrincipalPatchData): Promise<Principal> {
    const existing = this.store.get(id);
    if (!existing) throw new NotFoundError('principal', id);
    const updated = { ...existing, ...data } as Principal;
    this.store.set(id, updated);
    return updated;
  }
}

export class FakeProjectRepository implements ProjectRepository {
  private store = new Map<string, Project>();

  async findById(id: string): Promise<Project | null> {
    return this.store.get(id) ?? null;
  }

  async findByKey(workspaceId: string, key: string): Promise<Project | null> {
    for (const p of this.store.values()) {
      if (p.workspace_id === workspaceId && p.key === key) return p;
    }
    return null;
  }

  async list(workspaceId: string, cursor?: string, limit?: number): Promise<PaginatedResult<Project>> {
    const items = [...this.store.values()].filter((p) => p.workspace_id === workspaceId);
    return paginate(items, cursor, limit);
  }

  async create(data: ProjectCreateData): Promise<Project> {
    const p: Project = { ...data };
    this.store.set(p.id, p);
    return p;
  }

  async update(id: string, data: ProjectPatchData): Promise<Project> {
    const existing = this.store.get(id);
    if (!existing) throw new NotFoundError('project', id);
    const updated = { ...existing, ...data };
    this.store.set(id, updated);
    return updated;
  }
}

export class FakeTaskRepository implements TaskRepository {
  private store = new Map<string, Task>();
  private keySequences = new Map<string, number>();

  async findById(id: string): Promise<Task | null> {
    return this.store.get(id) ?? null;
  }

  async findByKey(workspaceId: string, key: string): Promise<Task | null> {
    for (const t of this.store.values()) {
      if (t.workspace_id === workspaceId && t.key === key) return t;
    }
    return null;
  }

  async list(workspaceId: string, filters: TaskListFilters, cursor?: string, limit?: number): Promise<PaginatedResult<Task>> {
    let items = [...this.store.values()].filter((t) => t.workspace_id === workspaceId);
    if (filters.status) items = items.filter((t) => t.status === filters.status);
    if (filters.assignee_id) items = items.filter((t) => t.assignee_id === filters.assignee_id);
    if (filters.project_id) items = items.filter((t) => t.project_id === filters.project_id);
    if (filters.claimed_by_id) items = items.filter((t) => t.claimed_by_id === filters.claimed_by_id);
    return paginate(items, cursor, limit);
  }

  async create(data: TaskCreateData): Promise<Task> {
    const t = { ...data } as Task;
    this.store.set(t.id, t);
    return t;
  }

  async update(id: string, data: TaskUpdateData, expectedVersion: number): Promise<Task> {
    const existing = this.store.get(id);
    if (!existing) throw new NotFoundError('task', id);
    if (existing.version !== expectedVersion) {
      throw new ConflictError(`version mismatch: expected ${expectedVersion}, got ${existing.version}`);
    }
    const updated = { ...existing, ...data } as Task;
    this.store.set(id, updated);
    return updated;
  }

  async nextKeyNumber(workspaceId: string, prefix: string): Promise<number> {
    const seqKey = `${workspaceId}:${prefix}`;
    const current = this.keySequences.get(seqKey) ?? 0;
    const next = current + 1;
    this.keySequences.set(seqKey, next);
    return next;
  }

  async findWithExpiredClaims(workspaceId: string): Promise<Task[]> {
    const now = new Date();
    return [...this.store.values()].filter((t) =>
      t.workspace_id === workspaceId &&
      t.claimed_by_id !== null &&
      t.claim_expires_at !== null &&
      new Date(t.claim_expires_at) <= now
    );
  }
}

export class FakeTaskUpdateRepository implements TaskUpdateRepository {
  private store: TaskUpdate[] = [];

  async list(taskId: string, cursor?: string, limit?: number): Promise<PaginatedResult<TaskUpdate>> {
    const items = this.store.filter((u) => u.task_id === taskId);
    return paginate(items, cursor, limit);
  }

  async create(data: TaskUpdateCreateData): Promise<TaskUpdate> {
    const u = { ...data, metadata_json: data.metadata_json ?? null } as TaskUpdate;
    this.store.push(u);
    return u;
  }

  async createWithAgentContext(
    data: TaskUpdateCreateData,
    _contexts: AgentActionContextCreateData[],
  ): Promise<TaskUpdate> {
    return this.create(data);
  }
}

export class FakeTransactionManager implements TransactionManager {
  constructor(private ctx: TransactionContext) {}

  async withTransaction<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return fn(this.ctx);
  }
}
