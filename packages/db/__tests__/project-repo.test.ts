import { describe, expect, it, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { DrizzleWorkspaceRepository } from '../src/repositories/workspace';
import { DrizzlePrincipalRepository } from '../src/repositories/principal';
import { DrizzleProjectRepository } from '../src/repositories/project';

describe('DrizzleProjectRepository', () => {
  let repo: DrizzleProjectRepository;
  const wsId = '01WS0001';
  const actorId = '01PR0001';
  const now = '2025-01-01T00:00:00.000Z';

  beforeEach(async () => {
    const db = createTestDb();
    const wsRepo = new DrizzleWorkspaceRepository(db);
    await wsRepo.create({ id: wsId, slug: 'default', name: 'Default', created_at: now, updated_at: now });
    const prRepo = new DrizzlePrincipalRepository(db);
    await prRepo.create({
      id: actorId,
      workspace_id: wsId,
      handle: 'alice',
      kind: 'human',
      display_name: null,
      metadata_json: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    repo = new DrizzleProjectRepository(db);
  });

  it('creates a project and returns it', async () => {
    const proj = await repo.create({
      id: '01PJ0001',
      workspace_id: wsId,
      key: 'ALPHA',
      name: 'Alpha Project',
      description: 'An alpha project',
      is_archived: false,
      created_by_id: actorId,
      updated_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    expect(proj).toEqual({
      id: '01PJ0001',
      workspace_id: wsId,
      key: 'ALPHA',
      name: 'Alpha Project',
      description: 'An alpha project',
      is_archived: false,
      created_by_id: actorId,
      updated_by_id: actorId,
      created_at: now,
      updated_at: now,
    });
  });

  it('findById returns the project', async () => {
    await repo.create({
      id: '01PJ0001',
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

    const found = await repo.findById('01PJ0001');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('01PJ0001');
    expect(found!.key).toBe('ALPHA');
  });

  it('findById returns null for non-existent id', async () => {
    const found = await repo.findById('nonexistent');
    expect(found).toBeNull();
  });

  it('findByKey returns the project', async () => {
    await repo.create({
      id: '01PJ0001',
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

    const found = await repo.findByKey(wsId, 'ALPHA');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('01PJ0001');
  });

  it('findByKey returns null for non-existent key', async () => {
    const found = await repo.findByKey(wsId, 'NONEXISTENT');
    expect(found).toBeNull();
  });

  it('findByKey scopes to workspace', async () => {
    await repo.create({
      id: '01PJ0001',
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

    const found = await repo.findByKey('other-ws', 'ALPHA');
    expect(found).toBeNull();
  });

  it('list returns projects in a workspace', async () => {
    await repo.create({
      id: '01PJ0001',
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
    await repo.create({
      id: '01PJ0002',
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

    const result = await repo.list(wsId);
    expect(result.items).toHaveLength(2);
    expect(result.next_cursor).toBeNull();
  });

  it('list supports cursor pagination', async () => {
    await repo.create({ id: '01PJ0001', workspace_id: wsId, key: 'A', name: 'A', description: null, is_archived: false, created_by_id: actorId, updated_by_id: actorId, created_at: now, updated_at: now });
    await repo.create({ id: '01PJ0002', workspace_id: wsId, key: 'B', name: 'B', description: null, is_archived: false, created_by_id: actorId, updated_by_id: actorId, created_at: now, updated_at: now });
    await repo.create({ id: '01PJ0003', workspace_id: wsId, key: 'C', name: 'C', description: null, is_archived: false, created_by_id: actorId, updated_by_id: actorId, created_at: now, updated_at: now });

    const page1 = await repo.list(wsId, undefined, 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.next_cursor).toBe('01PJ0002');
    expect(page1.items[0].id).toBe('01PJ0001');
    expect(page1.items[1].id).toBe('01PJ0002');

    const page2 = await repo.list(wsId, page1.next_cursor!, 2);
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].id).toBe('01PJ0003');
    expect(page2.next_cursor).toBeNull();
  });

  it('list scopes to workspace', async () => {
    await repo.create({ id: '01PJ0001', workspace_id: wsId, key: 'ALPHA', name: 'Alpha', description: null, is_archived: false, created_by_id: actorId, updated_by_id: actorId, created_at: now, updated_at: now });

    const result = await repo.list('other-ws');
    expect(result.items).toHaveLength(0);
  });

  it('update modifies fields and returns updated project', async () => {
    await repo.create({
      id: '01PJ0001',
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

    const later = '2025-06-01T00:00:00.000Z';
    const updated = await repo.update('01PJ0001', {
      name: 'Alpha Renamed',
      description: 'Now with a description',
      is_archived: true,
      updated_by_id: actorId,
      updated_at: later,
    });

    expect(updated.name).toBe('Alpha Renamed');
    expect(updated.description).toBe('Now with a description');
    expect(updated.is_archived).toBe(true);
    expect(updated.updated_at).toBe(later);
    expect(updated.updated_by_id).toBe(actorId);
    // unchanged fields
    expect(updated.key).toBe('ALPHA');
    expect(updated.workspace_id).toBe(wsId);
  });

  it('update throws NotFoundError for non-existent project', async () => {
    await expect(
      repo.update('nonexistent', { updated_by_id: actorId, updated_at: now }),
    ).rejects.toThrow('project not found: nonexistent');
  });

  it('handles null description correctly', async () => {
    await repo.create({
      id: '01PJ0001',
      workspace_id: wsId,
      key: 'ALPHA',
      name: 'Alpha',
      description: 'Has description',
      is_archived: false,
      created_by_id: actorId,
      updated_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    const updated = await repo.update('01PJ0001', {
      description: null,
      updated_by_id: actorId,
      updated_at: now,
    });

    expect(updated.description).toBeNull();
  });

  it('handles boolean is_archived correctly', async () => {
    await repo.create({
      id: '01PJ0001',
      workspace_id: wsId,
      key: 'ALPHA',
      name: 'Alpha',
      description: null,
      is_archived: true,
      created_by_id: actorId,
      updated_by_id: actorId,
      created_at: now,
      updated_at: now,
    });

    const found = await repo.findById('01PJ0001');
    expect(found!.is_archived).toBe(true);
  });
});
