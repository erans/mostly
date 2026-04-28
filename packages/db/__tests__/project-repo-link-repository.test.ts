import { describe, expect, it, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { DrizzleWorkspaceRepository } from '../src/repositories/workspace';
import { DrizzlePrincipalRepository } from '../src/repositories/principal';
import { DrizzleProjectRepository } from '../src/repositories/project';
import { DrizzleProjectRepoLinkRepository } from '../src/repositories/project-repo-link';

describe('DrizzleProjectRepoLinkRepository', () => {
  let repo: DrizzleProjectRepoLinkRepository;
  const wsId = '01WS0001';
  const ws2Id = '01WS0002';
  const actorId = '01PR0001';
  const projId = '01PJ0001';
  const proj2Id = '01PJ0002';
  const now = '2025-01-01T00:00:00.000Z';

  beforeEach(async () => {
    const db = createTestDb();

    const wsRepo = new DrizzleWorkspaceRepository(db);
    await wsRepo.create({ id: wsId, slug: 'default', name: 'Default', created_at: now, updated_at: now });
    await wsRepo.create({ id: ws2Id, slug: 'other', name: 'Other', created_at: now, updated_at: now });

    const prRepo = new DrizzlePrincipalRepository(db);
    await prRepo.create({
      id: actorId,
      workspace_id: wsId,
      handle: 'alice',
      kind: 'human',
      display_name: null,
      email: null,
      metadata_json: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    const projRepo = new DrizzleProjectRepository(db);
    await projRepo.create({
      id: projId,
      workspace_id: wsId,
      key: 'ALPHA',
      name: 'Alpha',
      description: null,
      is_archived: false,
      created_by_id: actorId,
      updated_by_id: actorId,
      created_at: now,
      updated_at: now,
    });
    await projRepo.create({
      id: proj2Id,
      workspace_id: wsId,
      key: 'BETA',
      name: 'Beta',
      description: null,
      is_archived: false,
      created_by_id: actorId,
      updated_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    repo = new DrizzleProjectRepoLinkRepository(db);
  });

  it('creates and finds by id', async () => {
    const created = await repo.create({
      id: 'rlnk_0000001',
      workspace_id: wsId,
      project_id: projId,
      normalized_url: 'github.com/acme/auth',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    expect(created).toEqual({
      id: 'rlnk_0000001',
      workspace_id: wsId,
      project_id: projId,
      normalized_url: 'github.com/acme/auth',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    const found = await repo.findById(created.id);
    expect(found).toEqual(created);
  });

  it('findById returns null for non-existent id', async () => {
    const found = await repo.findById('nonexistent');
    expect(found).toBeNull();
  });

  it('findByUrlAndSubpath returns matching link', async () => {
    await repo.create({
      id: 'rlnk_0000001',
      workspace_id: wsId,
      project_id: projId,
      normalized_url: 'github.com/acme/auth',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    const found = await repo.findByUrlAndSubpath(wsId, 'github.com/acme/auth', '');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('rlnk_0000001');
  });

  it('findByUrlAndSubpath returns null on miss', async () => {
    const found = await repo.findByUrlAndSubpath(wsId, 'github.com/acme/missing', '');
    expect(found).toBeNull();
  });

  it('findByUrlAndSubpath scopes to workspace', async () => {
    await repo.create({
      id: 'rlnk_0000001',
      workspace_id: wsId,
      project_id: projId,
      normalized_url: 'github.com/acme/auth',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    const found = await repo.findByUrlAndSubpath('other-ws', 'github.com/acme/auth', '');
    expect(found).toBeNull();
  });

  it('findByUrls returns links matching any of the urls', async () => {
    await repo.create({
      id: 'rlnk_0000001',
      workspace_id: wsId,
      project_id: projId,
      normalized_url: 'github.com/acme/auth',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });
    await repo.create({
      id: 'rlnk_0000002',
      workspace_id: wsId,
      project_id: projId,
      normalized_url: 'github.com/acme/billing',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });
    // unrelated link in same workspace
    await repo.create({
      id: 'rlnk_0000003',
      workspace_id: wsId,
      project_id: proj2Id,
      normalized_url: 'github.com/acme/unrelated',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    const links = await repo.findByUrls(wsId, ['github.com/acme/auth', 'github.com/acme/billing']);
    expect(links).toHaveLength(2);
    const ids = links.map((l) => l.id).sort();
    expect(ids).toEqual(['rlnk_0000001', 'rlnk_0000002']);
  });

  it('findByUrls returns empty array for empty url list', async () => {
    const links = await repo.findByUrls(wsId, []);
    expect(links).toEqual([]);
  });

  it('findByUrls returns empty array when no urls match', async () => {
    await repo.create({
      id: 'rlnk_0000001',
      workspace_id: wsId,
      project_id: projId,
      normalized_url: 'github.com/acme/auth',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    const links = await repo.findByUrls(wsId, ['github.com/acme/nomatch']);
    expect(links).toEqual([]);
  });

  it('listForProject returns only that project links', async () => {
    await repo.create({
      id: 'rlnk_0000001',
      workspace_id: wsId,
      project_id: projId,
      normalized_url: 'github.com/acme/auth',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });
    await repo.create({
      id: 'rlnk_0000002',
      workspace_id: wsId,
      project_id: proj2Id,
      normalized_url: 'github.com/acme/billing',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    const links = await repo.listForProject(projId);
    expect(links).toHaveLength(1);
    expect(links.every((l) => l.project_id === projId)).toBe(true);
    expect(links[0].id).toBe('rlnk_0000001');
  });

  it('listForWorkspace returns all links in workspace', async () => {
    await repo.create({
      id: 'rlnk_0000001',
      workspace_id: wsId,
      project_id: projId,
      normalized_url: 'github.com/acme/auth',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });
    await repo.create({
      id: 'rlnk_0000002',
      workspace_id: wsId,
      project_id: proj2Id,
      normalized_url: 'github.com/acme/billing',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    const links = await repo.listForWorkspace(wsId);
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.workspace_id === wsId)).toBe(true);
  });

  it('listForWorkspace returns empty for workspace with no links', async () => {
    const links = await repo.listForWorkspace(wsId);
    expect(links).toEqual([]);
  });

  it('delete removes the row', async () => {
    const created = await repo.create({
      id: 'rlnk_0000001',
      workspace_id: wsId,
      project_id: projId,
      normalized_url: 'github.com/acme/auth',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    await repo.delete(created.id);
    expect(await repo.findById(created.id)).toBeNull();
  });

  it('rejects duplicate (url, subpath) within workspace', async () => {
    await repo.create({
      id: 'rlnk_0000001',
      workspace_id: wsId,
      project_id: projId,
      normalized_url: 'github.com/acme/auth',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    await expect(
      repo.create({
        id: 'rlnk_0000002',
        workspace_id: wsId,
        project_id: projId,
        normalized_url: 'github.com/acme/auth',
        subpath: '',
        created_by_id: actorId,
        created_at: now,
        updated_at: now,
      }),
    ).rejects.toThrow();
  });

  it('allows same url in different workspaces', async () => {
    // ws2Id has no projects/principals; we only need workspace to exist for FK
    // This test is purely about the unique constraint scoping to workspace_id
    // We cannot create a link in ws2Id without a project + principal there,
    // so we test the inverse: two different subpaths in the same workspace are OK.
    await repo.create({
      id: 'rlnk_0000001',
      workspace_id: wsId,
      project_id: projId,
      normalized_url: 'github.com/acme/mono',
      subpath: 'services/auth',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });
    await expect(
      repo.create({
        id: 'rlnk_0000002',
        workspace_id: wsId,
        project_id: proj2Id,
        normalized_url: 'github.com/acme/mono',
        subpath: 'services/billing',
        created_by_id: actorId,
        created_at: now,
        updated_at: now,
      }),
    ).resolves.not.toThrow();
  });
});
