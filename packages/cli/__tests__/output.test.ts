import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatTable, formatCard, output, formatTaskList, formatTask, formatPrincipal, formatPrincipalList, formatProject, formatProjectList } from '../src/output.js';

describe('output', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatTable', () => {
    it('produces columnar output with headers', () => {
      const items = [
        { name: 'Alice', role: 'admin' },
        { name: 'Bob', role: 'user' },
      ];
      const columns = [
        { key: 'name', header: 'NAME', width: 10 },
        { key: 'role', header: 'ROLE', width: 8 },
      ];

      const result = formatTable(items, columns);
      const lines = result.split('\n');

      expect(lines[0]).toMatch(/^NAME\s+ROLE/);
      expect(lines[1]).toMatch(/^-{10}\s+-{8}/);
      expect(lines[2]).toMatch(/^Alice\s+admin/);
      expect(lines[3]).toMatch(/^Bob\s+user/);
    });

    it('returns "No items." for empty array', () => {
      expect(formatTable([], [{ key: 'x', header: 'X' }])).toBe('No items.');
    });

    it('handles missing values gracefully', () => {
      const items = [{ name: 'Alice' }];
      const columns = [
        { key: 'name', header: 'NAME' },
        { key: 'role', header: 'ROLE' },
      ];
      const result = formatTable(items, columns);
      expect(result).toContain('Alice');
    });
  });

  describe('formatCard', () => {
    it('shows key-value pairs', () => {
      const entity = { handle: 'alice', kind: 'human', display_name: 'Alice' };
      const result = formatCard(entity);

      expect(result).toContain('handle');
      expect(result).toContain('alice');
      expect(result).toContain('kind');
      expect(result).toContain('human');
      expect(result).toContain('display_name');
      expect(result).toContain('Alice');
    });

    it('respects field filter', () => {
      const entity = { handle: 'alice', kind: 'human', secret: 'hidden' };
      const result = formatCard(entity, ['handle', 'kind']);

      expect(result).toContain('handle');
      expect(result).toContain('kind');
      expect(result).not.toContain('secret');
    });

    it('handles null values', () => {
      const entity = { handle: 'alice', kind: null };
      const result = formatCard(entity as any);
      expect(result).toContain('handle');
      expect(result).toContain('alice');
    });
  });

  describe('output function', () => {
    it('outputs JSON when json option is true', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const data = { foo: 'bar' };
      output(data, { json: true });
      expect(spy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
    });

    it('outputs nothing when quiet option is true', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      output('anything', { quiet: true });
      expect(spy).not.toHaveBeenCalled();
    });

    it('outputs string directly in default mode', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      output('hello world', {});
      expect(spy).toHaveBeenCalledWith('hello world');
    });
  });

  describe('formatTaskList', () => {
    it('outputs JSON in json mode', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = {
        items: [{ key: 'PROJ-1', title: 'Task 1', status: 'open', assignee_handle: '' }],
        next_cursor: null,
      };
      formatTaskList(result, { json: true });
      expect(spy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
    });

    it('outputs only keys in quiet mode', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = {
        items: [
          { key: 'PROJ-1', title: 'Task 1', status: 'open' },
          { key: 'PROJ-2', title: 'Task 2', status: 'claimed' },
        ],
        next_cursor: null,
      };
      formatTaskList(result, { quiet: true });
      expect(spy).toHaveBeenCalledWith('PROJ-1');
      expect(spy).toHaveBeenCalledWith('PROJ-2');
    });
  });

  describe('formatTask', () => {
    it('outputs key in quiet mode', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      formatTask({ key: 'PROJ-1', title: 'Test' }, { quiet: true });
      expect(spy).toHaveBeenCalledWith('PROJ-1');
    });
  });

  describe('formatPrincipal', () => {
    it('outputs handle in quiet mode', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      formatPrincipal({ handle: 'alice', display_name: 'Alice' }, { quiet: true });
      expect(spy).toHaveBeenCalledWith('alice');
    });
  });

  describe('formatPrincipalList', () => {
    it('outputs table in default mode', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = {
        items: [
          { handle: 'alice', display_name: 'Alice', kind: 'human' },
        ],
      };
      formatPrincipalList(result, {});
      const output = spy.mock.calls[0][0];
      expect(output).toContain('HANDLE');
      expect(output).toContain('alice');
    });
  });

  describe('formatProject', () => {
    it('outputs slug in quiet mode', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      formatProject({ slug: 'my-proj', name: 'My Project' }, { quiet: true });
      expect(spy).toHaveBeenCalledWith('my-proj');
    });
  });

  describe('formatProjectList', () => {
    it('outputs table in default mode', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = {
        items: [
          { slug: 'proj', name: 'Project', prefix: 'PRJ' },
        ],
      };
      formatProjectList(result, {});
      const output = spy.mock.calls[0][0];
      expect(output).toContain('SLUG');
      expect(output).toContain('proj');
    });
  });
});
