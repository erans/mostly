import { useMemo, useState } from 'react';
import type { Task, TaskStatus } from '@mostly/types';
import { TaskRow } from './task-row';
import { StatusIcon } from './status-icon';

type GroupBy = 'status' | 'type' | 'none';
type SortBy = 'created' | 'updated' | 'key';

interface TaskListProps {
  title: string;
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (task: Task) => void;
}

const STATUS_ORDER: TaskStatus[] = ['in_progress', 'claimed', 'open', 'blocked', 'closed', 'canceled'];

function groupTasks(tasks: Task[], groupBy: GroupBy): Map<string, Task[]> {
  if (groupBy === 'none') return new Map([['all', tasks]]);
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task[groupBy];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(task);
  }
  if (groupBy === 'status') {
    const sorted = new Map<string, Task[]>();
    for (const s of STATUS_ORDER) {
      if (groups.has(s)) sorted.set(s, groups.get(s)!);
    }
    return sorted;
  }
  return groups;
}

export function TaskList({ title, tasks, selectedTaskId, onSelectTask }: TaskListProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [sortBy, setSortBy] = useState<SortBy>('created');

  const sorted = useMemo(() => {
    const copy = [...tasks];
    copy.sort((a, b) => {
      if (sortBy === 'created') return b.created_at.localeCompare(a.created_at);
      if (sortBy === 'updated') return b.updated_at.localeCompare(a.updated_at);
      return a.key.localeCompare(b.key);
    });
    return copy;
  }, [tasks, sortBy]);

  const grouped = useMemo(() => groupTasks(sorted, groupBy), [sorted, groupBy]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <h2 className="text-sm font-bold text-text">{title}</h2>
        <div className="flex items-center gap-2 text-[11px] text-text-secondary">
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="rounded border border-border bg-transparent px-2 py-0.5 text-[11px] focus:outline-none"
          >
            <option value="status">Group: Status</option>
            <option value="type">Group: Type</option>
            <option value="none">No grouping</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded border border-border bg-transparent px-2 py-0.5 text-[11px] focus:outline-none"
          >
            <option value="created">Sort: Newest</option>
            <option value="updated">Sort: Updated</option>
            <option value="key">Sort: Key</option>
          </select>
        </div>
      </div>

      {/* Task rows */}
      <div className="flex-1 overflow-y-auto">
        {Array.from(grouped.entries()).map(([group, groupedTasks]) => (
          <div key={group}>
            {groupBy !== 'none' && (
              <div className="flex items-center gap-2 px-3.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {groupBy === 'status' && <StatusIcon status={group as TaskStatus} size={10} />}
                {group.replace('_', ' ')}
                <span className="font-normal opacity-60">{groupedTasks.length}</span>
              </div>
            )}
            {groupedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={task.id === selectedTaskId}
                onSelect={onSelectTask}
              />
            ))}
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-text-muted">
            No tasks found
          </div>
        )}
      </div>
    </div>
  );
}
