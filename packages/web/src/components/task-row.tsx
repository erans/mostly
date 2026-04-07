import type { Task } from '@mostly/types';
import { StatusIcon } from './status-icon';
import { cn } from '@/lib/utils';
import { TYPE_COLORS } from '@/lib/constants';

interface TaskRowProps {
  task: Task;
  selected: boolean;
  onSelect: (task: Task) => void;
}

export function TaskRow({ task, selected, onSelect }: TaskRowProps) {
  const typeColor = TYPE_COLORS[task.type] ?? 'var(--color-text-muted)';

  return (
    <button
      onClick={() => onSelect(task)}
      className={cn(
        'flex w-full items-center gap-2.5 border-l-2 px-3.5 py-1.5 text-left transition-colors',
        selected
          ? 'border-l-accent bg-accent/[0.06]'
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
      <span className="min-w-[40px] shrink-0 text-right text-[11px] text-text-muted">
        {task.assignee_id ? task.assignee_id.slice(0, 8) : '\u2014'}
      </span>
    </button>
  );
}
