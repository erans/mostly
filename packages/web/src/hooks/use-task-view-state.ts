import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { TaskStatus, TaskType } from '@mostly/types';

export type GroupBy = 'status' | 'type' | 'project' | 'assignee' | 'none';
export type SortBy = 'created' | 'updated' | 'key' | 'status';

export interface FilterState {
  status: TaskStatus | '';
  type: TaskType | '';
  projectId: string;
  assigneeId: string;
}

export const EMPTY_FILTERS: FilterState = {
  status: '',
  type: '',
  projectId: '',
  assigneeId: '',
};

const DEFAULT_GROUP: GroupBy = 'status';
const DEFAULT_SORT: SortBy = 'created';

const VALID_GROUP: ReadonlySet<GroupBy> = new Set(['status', 'type', 'project', 'assignee', 'none']);
const VALID_SORT: ReadonlySet<SortBy> = new Set(['created', 'updated', 'key', 'status']);
const VALID_STATUS: ReadonlySet<TaskStatus> = new Set([
  'open', 'claimed', 'in_progress', 'blocked', 'closed', 'canceled',
]);
const VALID_TYPE: ReadonlySet<TaskType> = new Set([
  'feature', 'bug', 'chore', 'research', 'incident', 'question',
]);

/**
 * Reads task list view state (filters, grouping, sort) from URL search
 * params and provides setters that persist back to the URL. The URL is the
 * single source of truth so reload, share, and back/forward all just work.
 *
 * Defaults are *not* serialized: a clean URL (no params) renders the
 * default view. Setting a value back to its default removes the param.
 *
 * Updates use `replace` (no new history entry) — toggling a filter is not
 * a navigation a user wants in their back stack.
 */
export function useTaskViewState() {
  const [params, setParams] = useSearchParams();

  const filters: FilterState = useMemo(() => {
    const statusRaw = params.get('status') ?? '';
    const typeRaw = params.get('type') ?? '';
    return {
      status: VALID_STATUS.has(statusRaw as TaskStatus) ? (statusRaw as TaskStatus) : '',
      type: VALID_TYPE.has(typeRaw as TaskType) ? (typeRaw as TaskType) : '',
      projectId: params.get('project') ?? '',
      assigneeId: params.get('assignee') ?? '',
    };
  }, [params]);

  const groupRaw = params.get('group');
  const groupBy: GroupBy = groupRaw && VALID_GROUP.has(groupRaw as GroupBy)
    ? (groupRaw as GroupBy)
    : DEFAULT_GROUP;

  const sortRaw = params.get('sort');
  const sortBy: SortBy = sortRaw && VALID_SORT.has(sortRaw as SortBy)
    ? (sortRaw as SortBy)
    : DEFAULT_SORT;

  const setFilters = useCallback((next: FilterState) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      next.status ? out.set('status', next.status) : out.delete('status');
      next.type ? out.set('type', next.type) : out.delete('type');
      next.projectId ? out.set('project', next.projectId) : out.delete('project');
      next.assigneeId ? out.set('assignee', next.assigneeId) : out.delete('assignee');
      return out;
    }, { replace: true });
  }, [setParams]);

  const setGroupBy = useCallback((next: GroupBy) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (next === DEFAULT_GROUP) out.delete('group');
      else out.set('group', next);
      return out;
    }, { replace: true });
  }, [setParams]);

  const setSortBy = useCallback((next: SortBy) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (next === DEFAULT_SORT) out.delete('sort');
      else out.set('sort', next);
      return out;
    }, { replace: true });
  }, [setParams]);

  return { filters, groupBy, sortBy, setFilters, setGroupBy, setSortBy };
}
