import { describe, expect, it, beforeEach } from 'vitest';
import { PrincipalService } from '../../src/services/principal.js';
import { FakePrincipalRepository, makeWorkspace } from '../../src/test-utils/index.js';
import { InvalidArgumentError, NotFoundError } from '@mostly/types';

describe('PrincipalService', () => {
  let service: PrincipalService;
  let repo: FakePrincipalRepository;
  const ws = makeWorkspace({ id: '01WS' });

  beforeEach(() => {
    repo = new FakePrincipalRepository();
    service = new PrincipalService(repo);
  });

  describe('create', () => {
    it('creates a principal', async () => {
      const p = await service.create(ws.id, { handle: 'eran', kind: 'human', display_name: 'Eran' });
      expect(p.handle).toBe('eran');
      expect(p.kind).toBe('human');
      expect(p.display_name).toBe('Eran');
      expect(p.is_active).toBe(true);
      expect(p.workspace_id).toBe(ws.id);
    });

    it('rejects duplicate handle', async () => {
      await service.create(ws.id, { handle: 'eran', kind: 'human' });
      await expect(service.create(ws.id, { handle: 'eran', kind: 'agent' }))
        .rejects.toThrow(InvalidArgumentError);
    });
  });

  describe('get', () => {
    it('returns principal by id', async () => {
      const created = await service.create(ws.id, { handle: 'eran', kind: 'human' });
      const found = await service.get(created.id);
      expect(found.id).toBe(created.id);
    });

    it('throws NotFoundError for missing id', async () => {
      await expect(service.get('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getByHandle', () => {
    it('returns principal by handle', async () => {
      await service.create(ws.id, { handle: 'eran', kind: 'human' });
      const found = await service.getByHandle(ws.id, 'eran');
      expect(found.handle).toBe('eran');
    });

    it('throws NotFoundError for missing handle', async () => {
      await expect(service.getByHandle(ws.id, 'nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('list', () => {
    it('returns principals for workspace', async () => {
      await service.create(ws.id, { handle: 'a', kind: 'human' });
      await service.create(ws.id, { handle: 'b', kind: 'agent' });
      const result = await service.list(ws.id);
      expect(result.items).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('updates display_name', async () => {
      const created = await service.create(ws.id, { handle: 'eran', kind: 'human' });
      const updated = await service.update(created.id, { display_name: 'Eran S' });
      expect(updated.display_name).toBe('Eran S');
    });
  });
});
