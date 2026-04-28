import { describe, expect, it, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { DrizzleWorkspaceRepository } from '../src/repositories/workspace';
import { DrizzlePrincipalRepository } from '../src/repositories/principal';
import { DrizzleProjectRepository } from '../src/repositories/project';
import { DrizzleProjectRepoLinkRepository } from '../src/repositories/project-repo-link';

describe('DrizzleProjectRepoLinkRepository', () => {
  let repo: DrizzleProjectRepoLinkRepository;
  let db: ReturnType<typeof createTestDb>;
  const wsId = '01WS0001';
  const ws2Id = '01WS0002';
  const actorId = '01PR0001';
  const projId = '01PJ0001';
  const proj2Id = '01PJ0002';
  const now = '2025-01-01T00:00:00.000Z';

  beforeEach(async () => {
    db = createTestDb();

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
    // Create a principal and project in ws2 so FK constraints are satisfied.
    const actor2Id = '01PR0002';
    const proj3Id = '01PJ0003';

    const prRepo = new DrizzlePrincipalRepository(db);
    await prRepo.create({
      id: actor2Id,
      workspace_id: ws2Id,
      handle: 'bob',
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
      id: proj3Id,
      workspace_id: ws2Id,
      key: 'GAMMA',
      name: 'Gamma',
      description: null,
      is_archived: false,
      created_by_id: actor2Id,
      updated_by_id: actor2Id,
      created_at: now,
      updated_at: now,
    });

    // Insert the same (normalized_url, subpath) in ws1 and ws2 — must both succeed.
    const link1 = await repo.create({
      id: 'rlnk_0000001',
      workspace_id: wsId,
      project_id: projId,
      normalized_url: 'github.com/acme/auth',
      subpath: '',
      created_by_id: actorId,
      created_at: now,
      updated_at: now,
    });
    const link2 = await repo.create({
      id: 'rlnk_0000002',
      workspace_id: ws2Id,
      project_id: proj3Id,
      normalized_url: 'github.com/acme/auth',
      subpath: '',
      created_by_id: actor2Id,
      created_at: now,
      updated_at: now,
    });

    expect(link1.id).toBe('rlnk_0000001');
    expect(link2.id).toBe('rlnk_0000002');

    // findByUrls must be workspace-scoped: ws1 returns only link1, ws2 only link2.
    const ws1Links = await repo.findByUrls(wsId, ['github.com/acme/auth']);
    expect(ws1Links).toHaveLength(1);
    expect(ws1Links[0].id).toBe('rlnk_0000001');

    const ws2Links = await repo.findByUrls(ws2Id, ['github.com/acme/auth']);
    expect(ws2Links).toHaveLength(1);
    expect(ws2Links[0].id).toBe('rlnk_0000002');
  });
});
