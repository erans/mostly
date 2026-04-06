import { describe, expect, it, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { DrizzleWorkspaceRepository } from '../src/repositories/workspace';

describe('DrizzleWorkspaceRepository', () => {
  let repo: DrizzleWorkspaceRepository;

  beforeEach(() => {
    const db = createTestDb();
    repo = new DrizzleWorkspaceRepository(db);
  });

  const now = '2025-01-01T00:00:00.000Z';

  it('creates a workspace and returns it', async () => {
    const ws = await repo.create({
      id: '01WS0001',
      slug: 'default',
      name: 'Default Workspace',
      created_at: now,
      updated_at: now,
    });

    expect(ws).toEqual({
      id: '01WS0001',
      slug: 'default',
      name: 'Default Workspace',
      created_at: now,
      updated_at: now,
    });
  });

  it('findById returns the workspace', async () => {
    await repo.create({
      id: '01WS0001',
      slug: 'default',
      name: 'Default Workspace',
      created_at: now,
      updated_at: now,
    });

    const found = await repo.findById('01WS0001');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('01WS0001');
    expect(found!.slug).toBe('default');
    expect(found!.name).toBe('Default Workspace');
  });

  it('findById returns null for non-existent id', async () => {
    const found = await repo.findById('nonexistent');
    expect(found).toBeNull();
  });

  it('findBySlug returns the workspace', async () => {
    await repo.create({
      id: '01WS0001',
      slug: 'my-workspace',
      name: 'My Workspace',
      created_at: now,
      updated_at: now,
    });

    const found = await repo.findBySlug('my-workspace');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('01WS0001');
    expect(found!.slug).toBe('my-workspace');
  });

  it('findBySlug returns null for non-existent slug', async () => {
    const found = await repo.findBySlug('nonexistent');
    expect(found).toBeNull();
  });

  it('getDefault returns the first workspace', async () => {
    await repo.create({
      id: '01WS0001',
      slug: 'default',
      name: 'Default',
      created_at: now,
      updated_at: now,
    });

    const ws = await repo.getDefault();
    expect(ws.id).toBe('01WS0001');
  });

  it('getDefault throws NotFoundError when no workspaces exist', async () => {
    await expect(repo.getDefault()).rejects.toThrow('workspace not found: default');
  });

  it('create enforces unique slug constraint', async () => {
    await repo.create({
      id: '01WS0001',
      slug: 'unique-slug',
      name: 'First',
      created_at: now,
      updated_at: now,
    });

    await expect(
      repo.create({
        id: '01WS0002',
        slug: 'unique-slug',
        name: 'Second',
        created_at: now,
        updated_at: now,
      }),
    ).rejects.toThrow();
  });
});
