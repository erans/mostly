import { describe, expect, it, beforeEach } from 'vitest';
import { generateId, ID_PREFIXES, InvalidArgumentError, NotFoundError } from '@mostly/types';
import { RepoLinkService } from '../src/services/repo-link.js';

function makeFakeRepo(): any {
  const rows: any[] = [];
  return {
    rows,
    async create(d: any) { rows.push({ ...d }); return { ...d }; },
    async findById(id: string) { return rows.find(r => r.id === id) ?? null; },
    async findByUrlAndSubpath(ws: string, url: string, sp: string) {
      return rows.find(r => r.workspace_id === ws && r.normalized_url === url && r.subpath === sp) ?? null;
    },
    async findByUrls(ws: string, urls: string[]) {
      return rows.filter(r => r.workspace_id === ws && urls.includes(r.normalized_url));
    },
    async listForProject(pid: string) { return rows.filter(r => r.project_id === pid); },
    async listForWorkspace(ws: string) { return rows.filter(r => r.workspace_id === ws); },
    async delete(id: string) { const i = rows.findIndex(r => r.id === id); if (i >= 0) rows.splice(i, 1); },
  };
}

const fakeProjects = {
  async findById(id: string) {
    return { id, key: id.toUpperCase(), workspace_id: 'ws_1', is_archived: false } as any;
  },
} as any;

describe('RepoLinkService.resolve', () => {
  let svc: RepoLinkService;
  let repo: ReturnType<typeof makeFakeRepo>;
  beforeEach(() => {
    repo = makeFakeRepo();
    svc = new RepoLinkService(repo, fakeProjects);
  });

  it('returns null when no link matches any URL', async () => {
    const r = await svc.resolve('ws_1', { urls: ['github.com/acme/none'], rel_path: '' });
    expect(r).toBeNull();
  });

  it('matches a single link at root', async () => {
    await repo.create({ id: 'rlnk_1', workspace_id: 'ws_1', project_id: 'proj_1', normalized_url: 'github.com/acme/auth', subpath: '', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    const r = await svc.resolve('ws_1', { urls: ['github.com/acme/auth'], rel_path: '' });
    expect(r?.project_id).toBe('proj_1');
    expect(r?.matched_subpath).toBe('');
  });

  it('picks the longest subpath prefix when multiple match', async () => {
    await repo.create({ id: 'rlnk_root', workspace_id: 'ws_1', project_id: 'proj_root', normalized_url: 'github.com/acme/mono', subpath: '', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    await repo.create({ id: 'rlnk_auth', workspace_id: 'ws_1', project_id: 'proj_auth', normalized_url: 'github.com/acme/mono', subpath: 'packages/auth', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    const r = await svc.resolve('ws_1', { urls: ['github.com/acme/mono'], rel_path: 'packages/auth/src' });
    expect(r?.project_id).toBe('proj_auth');
  });

  it('throws when same-length subpaths match different projects (ambiguous)', async () => {
    await repo.create({ id: 'a', workspace_id: 'ws_1', project_id: 'proj_a', normalized_url: 'github.com/acme/mono', subpath: '', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    await repo.create({ id: 'b', workspace_id: 'ws_1', project_id: 'proj_b', normalized_url: 'github.com/acme/fork', subpath: '', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    await expect(
      svc.resolve('ws_1', { urls: ['github.com/acme/mono', 'github.com/acme/fork'], rel_path: '' }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('subpath that is not a prefix of rel_path is ignored', async () => {
    await repo.create({ id: 'a', workspace_id: 'ws_1', project_id: 'proj_a', normalized_url: 'github.com/acme/mono', subpath: 'packages/billing', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    const r = await svc.resolve('ws_1', { urls: ['github.com/acme/mono'], rel_path: 'packages/auth' });
    expect(r).toBeNull();
  });

  it('skips links whose project is archived', async () => {
    const projects = {
      async findById(id: string) {
        return { id, key: id, workspace_id: 'ws_1', is_archived: true } as any;
      },
    } as any;
    const svc2 = new RepoLinkService(repo, projects);
    await repo.create({ id: 'a', workspace_id: 'ws_1', project_id: 'proj_a', normalized_url: 'github.com/acme/auth', subpath: '', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    const r = await svc2.resolve('ws_1', { urls: ['github.com/acme/auth'], rel_path: '' });
    expect(r).toBeNull();
  });

  it('does not raise ambiguity when one of the candidates is archived', async () => {
    const projects = {
      async findById(id: string) {
        if (id === 'proj_a') return { id: 'proj_a', key: 'PROJA', workspace_id: 'ws_1', is_archived: false } as any;
        if (id === 'proj_b') return { id: 'proj_b', key: 'PROJB', workspace_id: 'ws_1', is_archived: true } as any;
        return null;
      },
    } as any;
    const svc2 = new RepoLinkService(repo, projects);
    await repo.create({ id: 'a', workspace_id: 'ws_1', project_id: 'proj_a', normalized_url: 'github.com/acme/mono', subpath: '', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    await repo.create({ id: 'b', workspace_id: 'ws_1', project_id: 'proj_b', normalized_url: 'github.com/acme/fork', subpath: '', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    const r = await svc2.resolve('ws_1', { urls: ['github.com/acme/mono', 'github.com/acme/fork'], rel_path: '' });
    expect(r?.project_id).toBe('proj_a');
  });
});

describe('RepoLinkService.link', () => {
  it('creates a link', async () => {
    const repo = makeFakeRepo();
    const svc = new RepoLinkService(repo, fakeProjects);
    const link = await svc.link('ws_1', 'proj_1', { normalized_url: 'github.com/acme/auth', subpath: '' }, 'prin_1');
    expect(link.normalized_url).toBe('github.com/acme/auth');
  });

  it('is idempotent when re-linking same project to same (url, subpath)', async () => {
    const repo = makeFakeRepo();
    const svc = new RepoLinkService(repo, fakeProjects);
    const a = await svc.link('ws_1', 'proj_1', { normalized_url: 'github.com/acme/auth', subpath: '' }, 'prin_1');
    const b = await svc.link('ws_1', 'proj_1', { normalized_url: 'github.com/acme/auth', subpath: '' }, 'prin_1');
    expect(a.id).toBe(b.id);
  });

  it('throws when (url, subpath) already linked to a different project', async () => {
    const repo = makeFakeRepo();
    const svc = new RepoLinkService(repo, fakeProjects);
    await svc.link('ws_1', 'proj_1', { normalized_url: 'github.com/acme/auth', subpath: '' }, 'prin_1');
    await expect(
      svc.link('ws_1', 'proj_2', { normalized_url: 'github.com/acme/auth', subpath: '' }, 'prin_1'),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });
});

describe('RepoLinkService.unlink', () => {
  it('removes the link', async () => {
    const repo = makeFakeRepo();
    const svc = new RepoLinkService(repo, fakeProjects);
    const link = await svc.link('ws_1', 'proj_1', { normalized_url: 'github.com/acme/auth', subpath: '' }, 'prin_1');
    await svc.unlink('ws_1', link.id);
    expect(await repo.findById(link.id)).toBeNull();
  });

  it('throws NotFoundError when link does not exist', async () => {
    const repo = makeFakeRepo();
    const svc = new RepoLinkService(repo, fakeProjects);
    await expect(svc.unlink('ws_1', 'rlnk_nonexistent')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when link belongs to a different workspace', async () => {
    const repo = makeFakeRepo();
    const svc = new RepoLinkService(repo, fakeProjects);
    await repo.create({ id: 'rlnk_x', workspace_id: 'ws_other', project_id: 'proj_1', normalized_url: 'github.com/acme/auth', subpath: '', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    await expect(svc.unlink('ws_1', 'rlnk_x')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('RepoLinkService.listForProject', () => {
  it('returns only links for the given project', async () => {
    const repo = makeFakeRepo();
    const svc = new RepoLinkService(repo, fakeProjects);
    await repo.create({ id: 'a', workspace_id: 'ws_1', project_id: 'proj_1', normalized_url: 'github.com/acme/auth', subpath: '', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    await repo.create({ id: 'b', workspace_id: 'ws_1', project_id: 'proj_2', normalized_url: 'github.com/acme/billing', subpath: '', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    const links = await svc.listForProject('proj_1');
    expect(links).toHaveLength(1);
    expect(links[0].project_id).toBe('proj_1');
  });
});

describe('RepoLinkService.listForWorkspace', () => {
  it('returns all links in the workspace', async () => {
    const repo = makeFakeRepo();
    const svc = new RepoLinkService(repo, fakeProjects);
    await repo.create({ id: 'a', workspace_id: 'ws_1', project_id: 'proj_1', normalized_url: 'github.com/acme/auth', subpath: '', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    await repo.create({ id: 'b', workspace_id: 'ws_1', project_id: 'proj_2', normalized_url: 'github.com/acme/billing', subpath: '', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    await repo.create({ id: 'c', workspace_id: 'ws_other', project_id: 'proj_3', normalized_url: 'github.com/acme/other', subpath: '', created_by_id: 'p', created_at: 'now', updated_at: 'now' });
    const links = await svc.listForWorkspace('ws_1');
    expect(links).toHaveLength(2);
    expect(links.every(l => l.workspace_id === 'ws_1')).toBe(true);
  });
});
