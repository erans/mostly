import { useEffect, useMemo, useRef } from 'react';
import type { Task, TaskStatus, TaskType, Principal, Project } from '@mostly/types';
import { TaskRow } from './task-row';
import { StatusIcon } from './status-icon';
import { Filter, Layers, ArrowUpDown, X } from 'lucide-react';
import {
  EMPTY_FILTERS,
  type FilterState,
  type GroupBy,
  type SortBy,
} from '@/hooks/use-task-view-state';

interface TaskListProps {
  title: string;
  tasks: Task[];
  selectedTaskId: string | null;
  highlightedTaskId?: string | null;
  onSelectTask: (task: Task) => void;
  principals?: Map<string, Principal>;
  projects?: Map<string, Project>;
  /** Notifies parent of the current sorted+filtered task order (for keyboard nav). */
  onOrderChange?: (tasks: Task[]) => void;
  filters: FilterState;
  groupBy: GroupBy;
  sortBy: SortBy;
  onFiltersChange: (next: FilterState) => void;
  onGroupByChange: (next: GroupBy) => void;
  onSortByChange: (next: SortBy) => void;
}

const STATUS_ORDER: TaskStatus[] = ['in_progress', 'claimed', 'open', 'blocked', 'closed', 'canceled'];
const STATUS_RANK: Record<TaskStatus, number> = STATUS_ORDER.reduce((acc, s, i) => {
  acc[s] = i;
  return acc;
}, {} as Record<TaskStatus, number>);

const ALL_STATUSES: TaskStatus[] = ['open', 'claimed', 'in_progress', 'blocked', 'closed', 'canceled'];
const ALL_TYPES: TaskType[] = ['feature', 'bug', 'chore', 'research', 'incident', 'question'];

function groupTasks(
  tasks: Task[],
  groupBy: GroupBy,
  principals?: Map<string, Principal>,
  projects?: Map<string, Project>,
): Map<string, { label: string; tasks: Task[] }> {
  if (groupBy === 'none') return new Map([['all', { label: 'all', tasks }]]);
  const groups = new Map<string, { label: string; tasks: Task[] }>();
  for (const task of tasks) {
    let key: string;
    let label: string;
    if (groupBy === 'project') {
      key = task.project_id ?? '__none__';
      label = task.project_id ? projects?.get(task.project_id)?.key ?? task.project_id.slice(0, 8) : 'No project';
    } else if (groupBy === 'assignee') {
      key = task.assignee_id ?? '__none__';
      label = task.assignee_id ? principals?.get(task.assignee_id)?.handle ?? task.assignee_id.slice(0, 8) : 'Unassigned';
    } else {
      key = task[groupBy];
      label = key.replace('_', ' ');
    }
    if (!groups.has(key)) groups.set(key, { label, tasks: [] });
    groups.get(key)!.tasks.push(task);
  }
  if (groupBy === 'status') {
    const sorted = new Map<string, { label: string; tasks: Task[] }>();
    for (const s of STATUS_ORDER) {
      if (groups.has(s)) sorted.set(s, groups.get(s)!);
    }
    return sorted;
  }
  return groups;
}

export function TaskList({
  title,
  tasks,
  selectedTaskId,
  highlightedTaskId,
  onSelectTask,
  principals,
  projects,
  onOrderChange,
  filters,
  groupBy,
  sortBy,
  onFiltersChange,
  onGroupByChange,
  onSortByChange,
}: TaskListProps) {

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filters.status && t.status !== filters.status) return false;
      if (filters.type && t.type !== filters.type) return false;
      if (filters.projectId && t.project_id !== filters.projectId) return false;
      if (filters.assigneeId && t.assignee_id !== filters.assigneeId) return false;
      return true;
    });
  }, [tasks, filters]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortBy === 'created') return b.created_at.localeCompare(a.created_at);
      if (sortBy === 'updated') return b.updated_at.localeCompare(a.updated_at);
      if (sortBy === 'status') return STATUS_RANK[a.status] - STATUS_RANK[b.status];
      return a.key.localeCompare(b.key);
    });
    return copy;
  }, [filtered, sortBy]);

  const grouped = useMemo(() => groupTasks(sorted, groupBy, principals, projects), [sorted, groupBy, principals, projects]);

  // Compute the flat order matching what's rendered (group-aware), so j/k
  // navigates in visible row order rather than the unsorted source order.
  const flatOrder = useMemo(() => {
    const out: Task[] = [];
    for (const { tasks: groupTasks } of grouped.values()) {
      for (const t of groupTasks) out.push(t);
    }
    return out;
  }, [grouped]);

  // Notify parent when the visible task order changes so keyboard nav can
  // walk the list in render order.
  const orderKey = flatOrder.map((t) => t.id).join(',');
  const lastOrderRef = useRef<string>('');
  useEffect(() => {
    if (!onOrderChange) return;
    if (lastOrderRef.current === orderKey) return;
    lastOrderRef.current = orderKey;
    onOrderChange(flatOrder);
  }, [orderKey, flatOrder, onOrderChange]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <h2 className="text-sm font-bold text-text">{title}</h2>
        <div className="flex items-center gap-2 text-[11px] text-text-secondary">
          {/* Filter: status */}
          <div className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
            <Filter size={10} className="text-text-muted" />
            <select
              value={filters.status}
              onChange={(e) => onFiltersChange({ ...filters, status: e.target.value as TaskStatus | '' })}
              className="bg-transparent text-[11px] focus:outline-none"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          {/* Filter: type */}
          <select
            value={filters.type}
            onChange={(e) => onFiltersChange({ ...filters, type: e.target.value as TaskType | '' })}
            className="rounded border border-border bg-transparent px-2 py-0.5 text-[11px] focus:outline-none"
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {/* Filter: project */}
          {projects && projects.size > 0 && (
            <select
              value={filters.projectId}
              onChange={(e) => onFiltersChange({ ...filters, projectId: e.target.value })}
              className="rounded border border-border bg-transparent px-2 py-0.5 text-[11px] focus:outline-none"
              aria-label="Filter by project"
            >
              <option value="">All projects</option>
              {Array.from(projects.values()).map((p) => (
                <option key={p.id} value={p.id}>{p.key}</option>
              ))}
            </select>
          )}
          {/* Filter: assignee */}
          {principals && principals.size > 0 && (
            <select
              value={filters.assigneeId}
              onChange={(e) => onFiltersChange({ ...filters, assigneeId: e.target.value })}
              className="rounded border border-border bg-transparent px-2 py-0.5 text-[11px] focus:outline-none"
              aria-label="Filter by assignee"
            >
              <option value="">All assignees</option>
              {Array.from(principals.values()).map((p) => (
                <option key={p.id} value={p.id}>{p.handle}</option>
              ))}
            </select>
          )}
          {activeFilterCount > 0 && (
            <button
              onClick={() => onFiltersChange(EMPTY_FILTERS)}
              className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-text-muted hover:text-text"
              aria-label="Clear filters"
            >
              <X size={10} />
              <span>Clear</span>
            </button>
          )}

          <div className="mx-1 h-3.5 w-px bg-border" />

          <div className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
            <Layers size={10} className="text-text-muted" />
            <select
              value={groupBy}
              onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
              className="bg-transparent text-[11px] focus:outline-none"
              aria-label="Group by"
            >
              <option value="status">Status</option>
              <option value="type">Type</option>
              <option value="project">Project</option>
              <option value="assignee">Assignee</option>
              <option value="none">No grouping</option>
            </select>
          </div>
          <div className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
            <ArrowUpDown size={10} className="text-text-muted" />
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value as SortBy)}
              className="bg-transparent text-[11px] focus:outline-none"
              aria-label="Sort by"
            >
              <option value="created">Newest</option>
              <option value="updated">Updated</option>
              <option value="key">Key</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>
      </div>

      {/* Task rows */}
      <div className="flex-1 overflow-y-auto">
        {Array.from(grouped.entries()).map(([groupKey, { label, tasks: groupedTasks }]) => (
          <div key={groupKey}>
            {groupBy !== 'none' && (
              <div className="flex items-center gap-2 px-3.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {groupBy === 'status' && <StatusIcon status={groupKey as TaskStatus} size={10} />}
                {label}
                <span className="font-normal opacity-60">{groupedTasks.length}</span>
              </div>
            )}
            {groupedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={task.id === selectedTaskId}
                highlighted={task.id === highlightedTaskId && task.id !== selectedTaskId}
                onSelect={onSelectTask}
                principals={principals}
              />
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-text-muted">
            {tasks.length === 0 ? 'No tasks found' : 'No tasks match these filters'}
          </div>
        )}
      </div>
    </div>
  );
}
