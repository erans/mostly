import type { Task, Principal } from '@mostly/types';
import { StatusIcon } from './status-icon';
import { cn } from '@/lib/utils';
import { TYPE_COLORS } from '@/lib/constants';

interface TaskRowProps {
  task: Task;
  selected: boolean;
  highlighted?: boolean;
  onSelect: (task: Task) => void;
  principals?: Map<string, Principal>;
}

export function TaskRow({ task, selected, highlighted, onSelect, principals }: TaskRowProps) {
  const typeColor = TYPE_COLORS[task.type] ?? 'var(--color-text-muted)';
  const assignee = task.assignee_id ? principals?.get(task.assignee_id) : null;
  const assigneeLabel = assignee?.handle ?? (task.assignee_id ? task.assignee_id.slice(0, 8) : '—');

  return (
    <button
      onClick={() => onSelect(task)}
      data-task-row={task.id}
      className={cn(
        'flex w-full items-center gap-2.5 border-l-2 px-3.5 py-1.5 text-left transition-colors',
        selected
          ? 'border-l-accent bg-accent/[0.06]'
          : highlighted
            ? 'border-l-transparent bg-border/30'
            : 'border-l-transparent hover:bg-border/20',
      )}
    >
      <StatusIcon status={task.status} />
      <span className="min-w-[52px] shrink-0 font-mono text-[11px] text-text-muted">{task.key}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{task.title}</span>
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
        style={{
          backgroundColor: `color-mix(in srgb, ${typeColor} 15%, transparent)`,
          color: typeColor,
        }}
      >
        {task.type}
      </span>
      <span className="min-w-[60px] shrink-0 truncate text-right text-[11px] text-text-muted">
        {assigneeLabel}
      </span>
    </button>
  );
}
