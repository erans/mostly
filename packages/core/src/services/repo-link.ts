import { generateId, ID_PREFIXES, InvalidArgumentError, NotFoundError } from '@mostly/types';
import type { ProjectRepoLink, GitContextResolveResponse } from '@mostly/types';
import type { ProjectRepoLinkRepository, ProjectRepository } from '../repositories/index.js';

export interface LinkInput {
  normalized_url: string;
  subpath: string;
}

export interface ResolveInput {
  urls: string[];
  rel_path: string;
}

export class RepoLinkService {
  constructor(
    private links: ProjectRepoLinkRepository,
    private projects: ProjectRepository,
  ) {}

  async link(workspaceId: string, projectId: string, input: LinkInput, actorId: string): Promise<ProjectRepoLink> {
    const project = await this.projects.findById(projectId);
    if (!project || project.workspace_id !== workspaceId) {
      throw new NotFoundError('project', projectId);
    }
    const existing = await this.links.findByUrlAndSubpath(workspaceId, input.normalized_url, input.subpath);
    if (existing) {
      if (existing.project_id === projectId) return existing;
      throw new InvalidArgumentError(
        `(${input.normalized_url}, "${input.subpath}") already linked to project ${existing.project_id}`,
      );
    }
    const now = new Date().toISOString();
    return this.links.create({
      id: generateId(ID_PREFIXES.repoLink),
      workspace_id: workspaceId,
      project_id: projectId,
      normalized_url: input.normalized_url,
      subpath: input.subpath,
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });
  }

  async unlink(workspaceId: string, linkId: string): Promise<void> {
    const link = await this.links.findById(linkId);
    if (!link || link.workspace_id !== workspaceId) {
      throw new NotFoundError('repoLink', linkId);
    }
    await this.links.delete(linkId);
  }

  async listForProject(projectId: string): Promise<ProjectRepoLink[]> {
    return this.links.listForProject(projectId);
  }

  async listForWorkspace(workspaceId: string): Promise<ProjectRepoLink[]> {
    return this.links.listForWorkspace(workspaceId);
  }

  async resolve(workspaceId: string, input: ResolveInput): Promise<GitContextResolveResponse | null> {
    const candidates = await this.links.findByUrls(workspaceId, input.urls);
    const matching = candidates.filter((l) => isPrefix(l.subpath, input.rel_path));
    if (matching.length === 0) return null;

    matching.sort((a, b) => b.subpath.length - a.subpath.length);
    const longest = matching[0].subpath.length;
    const top = matching.filter((l) => l.subpath.length === longest);
    const projectIds = new Set(top.map((l) => l.project_id));
    if (projectIds.size > 1) {
      const projects = await Promise.all(top.map((l) => this.projects.findById(l.project_id)));
      const labels = projects
        .map((p, i) => `${top[i].normalized_url} → ${p?.key ?? top[i].project_id}`)
        .join(', ');
      throw new InvalidArgumentError(`ambiguous git context: ${labels}. Pass --project explicitly or use --no-git-context.`);
    }

    const winner = top[0];
    const project = await this.projects.findById(winner.project_id);
    if (!project || project.is_archived) return null;

    return {
      project_id: project.id,
      project_key: project.key,
      link_id: winner.id,
      matched_url: winner.normalized_url,
      matched_subpath: winner.subpath,
    };
  }
}

function isPrefix(subpath: string, relPath: string): boolean {
  if (subpath === '') return true;
  if (relPath === subpath) return true;
  return relPath.startsWith(subpath + '/');
}
