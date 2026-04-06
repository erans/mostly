import { generateId, ID_PREFIXES, NotFoundError, InvalidArgumentError } from '@mostly/types';
import type { Project } from '@mostly/types';
import type { ProjectRepository, PaginatedResult } from '../repositories/index.js';

export interface CreateProjectInput {
  key: string;
  name: string;
  description?: string | null;
}

export class ProjectService {
  constructor(private projects: ProjectRepository) {}

  async create(workspaceId: string, input: CreateProjectInput, actorId: string): Promise<Project> {
    const existing = await this.projects.findByKey(workspaceId, input.key);
    if (existing) {
      throw new InvalidArgumentError(`project with key "${input.key}" already exists`);
    }
    const now = new Date().toISOString();
    return this.projects.create({
      id: generateId(ID_PREFIXES.project),
      workspace_id: workspaceId,
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      is_archived: false,
      created_by_id: actorId,
      updated_by_id: actorId,
      created_at: now,
      updated_at: now,
    });
  }

  async get(id: string): Promise<Project> {
    const p = await this.projects.findById(id);
    if (!p) throw new NotFoundError('project', id);
    return p;
  }

  async getByKey(workspaceId: string, key: string): Promise<Project> {
    const p = await this.projects.findByKey(workspaceId, key);
    if (!p) throw new NotFoundError('project', key);
    return p;
  }

  async list(workspaceId: string, cursor?: string, limit?: number): Promise<PaginatedResult<Project>> {
    return this.projects.list(workspaceId, cursor, limit);
  }

  async update(id: string, input: Partial<Pick<Project, 'name' | 'description' | 'is_archived'>>, actorId: string): Promise<Project> {
    const existing = await this.projects.findById(id);
    if (!existing) throw new NotFoundError('project', id);
    return this.projects.update(id, {
      ...input,
      updated_by_id: actorId,
      updated_at: new Date().toISOString(),
    });
  }
}
