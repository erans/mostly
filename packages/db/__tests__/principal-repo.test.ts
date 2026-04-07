import { describe, expect, it, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { DrizzleWorkspaceRepository } from '../src/repositories/workspace';
import { DrizzlePrincipalRepository } from '../src/repositories/principal';

describe('DrizzlePrincipalRepository', () => {
  let repo: DrizzlePrincipalRepository;
  const wsId = '01WS0001';
  const now = '2025-01-01T00:00:00.000Z';

  beforeEach(async () => {
    const db = createTestDb();
    const wsRepo = new DrizzleWorkspaceRepository(db);
    await wsRepo.create({ id: wsId, slug: 'default', name: 'Default', created_at: now, updated_at: now });
    repo = new DrizzlePrincipalRepository(db);
  });

  it('creates a principal and returns it', async () => {
    const p = await repo.create({
      id: '01PR0001',
      workspace_id: wsId,
      handle: 'alice',
      kind: 'human',
      display_name: 'Alice',
      metadata_json: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    expect(p).toEqual({
      id: '01PR0001',
      workspace_id: wsId,
      handle: 'alice',
      kind: 'human',
      display_name: 'Alice',
      metadata_json: null,
      is_active: true,
      is_admin: false,
      created_at: now,
      updated_at: now,
    });
  });

  it('findById returns the principal', async () => {
    await repo.create({
      id: '01PR0001',
      workspace_id: wsId,
      handle: 'alice',
      kind: 'human',
      display_name: 'Alice',
      metadata_json: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    const found = await repo.findById('01PR0001');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('01PR0001');
    expect(found!.handle).toBe('alice');
  });

  it('findById returns null for non-existent id', async () => {
    const found = await repo.findById('nonexistent');
    expect(found).toBeNull();
  });

  it('findByHandle returns the principal', async () => {
    await repo.create({
      id: '01PR0001',
      workspace_id: wsId,
      handle: 'alice',
      kind: 'human',
      display_name: null,
      metadata_json: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    const found = await repo.findByHandle(wsId, 'alice');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('01PR0001');
  });

  it('findByHandle returns null for non-existent handle', async () => {
    const found = await repo.findByHandle(wsId, 'nonexistent');
    expect(found).toBeNull();
  });

  it('findByHandle scopes to workspace', async () => {
    await repo.create({
      id: '01PR0001',
      workspace_id: wsId,
      handle: 'alice',
      kind: 'human',
      display_name: null,
      metadata_json: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    const found = await repo.findByHandle('other-ws', 'alice');
    expect(found).toBeNull();
  });

  it('handles metadata_json round-trip', async () => {
    const metadata = { role: 'admin', prefs: { theme: 'dark' } };
    await repo.create({
      id: '01PR0001',
      workspace_id: wsId,
      handle: 'alice',
      kind: 'agent',
      display_name: 'Alice Bot',
      metadata_json: metadata,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    const found = await repo.findById('01PR0001');
    expect(found!.metadata_json).toEqual(metadata);
  });

  it('list returns principals in a workspace', async () => {
    await repo.create({
      id: '01PR0001',
      workspace_id: wsId,
      handle: 'alice',
      kind: 'human',
      display_name: null,
      metadata_json: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    await repo.create({
      id: '01PR0002',
      workspace_id: wsId,
      handle: 'bob',
      kind: 'human',
      display_name: null,
      metadata_json: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    const result = await repo.list(wsId);
    expect(result.items).toHaveLength(2);
    expect(result.next_cursor).toBeNull();
  });

  it('list supports cursor pagination', async () => {
    await repo.create({ id: 'prin_aaa0001', workspace_id: wsId, handle: 'a', kind: 'human', display_name: null, metadata_json: null, is_active: true, created_at: '2025-01-01T00:00:01.000Z', updated_at: '2025-01-01T00:00:01.000Z' });
    await repo.create({ id: 'prin_aaa0002', workspace_id: wsId, handle: 'b', kind: 'human', display_name: null, metadata_json: null, is_active: true, created_at: '2025-01-01T00:00:02.000Z', updated_at: '2025-01-01T00:00:02.000Z' });
    await repo.create({ id: 'prin_aaa0003', workspace_id: wsId, handle: 'c', kind: 'human', display_name: null, metadata_json: null, is_active: true, created_at: '2025-01-01T00:00:03.000Z', updated_at: '2025-01-01T00:00:03.000Z' });

    const page1 = await repo.list(wsId, undefined, 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.next_cursor).toBe('2025-01-01T00:00:02.000Z|prin_aaa0002');
    expect(page1.items[0].id).toBe('prin_aaa0001');
    expect(page1.items[1].id).toBe('prin_aaa0002');

    const page2 = await repo.list(wsId, page1.next_cursor!, 2);
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].id).toBe('prin_aaa0003');
    expect(page2.next_cursor).toBeNull();
  });

  it('list scopes to workspace', async () => {
    await repo.create({ id: '01PR0001', workspace_id: wsId, handle: 'alice', kind: 'human', display_name: null, metadata_json: null, is_active: true, created_at: now, updated_at: now });

    const result = await repo.list('other-ws');
    expect(result.items).toHaveLength(0);
  });

  it('update modifies fields and returns updated principal', async () => {
    await repo.create({
      id: '01PR0001',
      workspace_id: wsId,
      handle: 'alice',
      kind: 'human',
      display_name: 'Alice',
      metadata_json: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    const later = '2025-06-01T00:00:00.000Z';
    const updated = await repo.update('01PR0001', {
      display_name: 'Alice Updated',
      is_active: false,
      metadata_json: { key: 'value' },
      updated_at: later,
    });

    expect(updated.display_name).toBe('Alice Updated');
    expect(updated.is_active).toBe(false);
    expect(updated.metadata_json).toEqual({ key: 'value' });
    expect(updated.updated_at).toBe(later);
    // unchanged fields
    expect(updated.handle).toBe('alice');
    expect(updated.kind).toBe('human');
  });

  it('update throws NotFoundError for non-existent principal', async () => {
    await expect(
      repo.update('nonexistent', { updated_at: now }),
    ).rejects.toThrow('principal not found: nonexistent');
  });

  it('handles boolean is_active correctly', async () => {
    await repo.create({
      id: '01PR0001',
      workspace_id: wsId,
      handle: 'alice',
      kind: 'human',
      display_name: null,
      metadata_json: null,
      is_active: false,
      created_at: now,
      updated_at: now,
    });

    const found = await repo.findById('01PR0001');
    expect(found!.is_active).toBe(false);
  });
});
