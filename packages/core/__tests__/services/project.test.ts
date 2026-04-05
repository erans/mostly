import { describe, expect, it, beforeEach } from 'vitest';
import { ProjectService } from '../../src/services/project.js';
import { FakeProjectRepository, makeWorkspace, makePrincipal } from '../../src/test-utils/index.js';
import { InvalidArgumentError, NotFoundError } from '@mostly/types';

describe('ProjectService', () => {
  let service: ProjectService;
  let repo: FakeProjectRepository;
  const ws = makeWorkspace({ id: '01WS' });
  const actor = makePrincipal({ id: '01ACTOR', workspace_id: ws.id });

  beforeEach(() => {
    repo = new FakeProjectRepository();
    service = new ProjectService(repo);
  });

  describe('create', () => {
    it('creates a project', async () => {
      const p = await service.create(ws.id, { key: 'AUTH', name: 'Authentication' }, actor.id);
      expect(p.key).toBe('AUTH');
      expect(p.name).toBe('Authentication');
      expect(p.created_by_id).toBe(actor.id);
    });

    it('rejects duplicate key', async () => {
      await service.create(ws.id, { key: 'AUTH', name: 'Auth' }, actor.id);
      await expect(service.create(ws.id, { key: 'AUTH', name: 'Auth 2' }, actor.id))
        .rejects.toThrow(InvalidArgumentError);
    });
  });

  describe('get', () => {
    it('returns project by id', async () => {
      const created = await service.create(ws.id, { key: 'AUTH', name: 'Auth' }, actor.id);
      const found = await service.get(created.id);
      expect(found.key).toBe('AUTH');
    });

    it('throws NotFoundError for missing id', async () => {
      await expect(service.get('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getByKey', () => {
    it('returns project by key', async () => {
      await service.create(ws.id, { key: 'AUTH', name: 'Auth' }, actor.id);
      const found = await service.getByKey(ws.id, 'AUTH');
      expect(found.name).toBe('Auth');
    });
  });

  describe('list', () => {
    it('returns projects for workspace', async () => {
      await service.create(ws.id, { key: 'A', name: 'A' }, actor.id);
      await service.create(ws.id, { key: 'B', name: 'B' }, actor.id);
      const result = await service.list(ws.id);
      expect(result.items).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('updates name', async () => {
      const created = await service.create(ws.id, { key: 'AUTH', name: 'Auth' }, actor.id);
      const updated = await service.update(created.id, { name: 'Authentication' }, actor.id);
      expect(updated.name).toBe('Authentication');
    });
  });
});
