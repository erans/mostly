import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router';
import { useTaskList } from '@/hooks/use-tasks';
import { useProjects } from '@/hooks/use-projects';
import { useTheme } from '@/hooks/use-theme';
import { StatusIcon } from './status-icon';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onCreateTask: () => void;
}

export function CommandPalette({ open, onClose, onCreateTask }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { data: tasksData } = useTaskList({ limit: 50 });
  const { data: projects } = useProjects();
  const { toggleTheme } = useTheme();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  if (!open) return null;

  const tasks = tasksData?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">
        <Command
          className="overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        >
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Search tasks, projects, or actions..."
            className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-text-muted">
              No results found.
            </Command.Empty>

            <Command.Group heading="Actions" className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              <Command.Item
                value="create task"
                onSelect={() => { onClose(); onCreateTask(); }}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-text data-[selected]:bg-accent/10"
              >
                Create task
              </Command.Item>
              <Command.Item
                value="show blocked tasks"
                onSelect={() => { onClose(); navigate('/views/blocked'); }}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-text data-[selected]:bg-accent/10"
              >
                Show blocked
              </Command.Item>
              <Command.Item
                value="toggle theme dark light"
                onSelect={() => { onClose(); toggleTheme(); }}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-text data-[selected]:bg-accent/10"
              >
                Toggle theme
              </Command.Item>
            </Command.Group>

            {tasks.length > 0 && (
              <Command.Group heading="Tasks" className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {tasks.map((task) => (
                  <Command.Item
                    key={task.id}
                    value={`${task.key} ${task.title}`}
                    onSelect={() => { onClose(); navigate(`/tasks/all/${task.id}`); }}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-text data-[selected]:bg-accent/10"
                  >
                    <StatusIcon status={task.status} size={12} />
                    <span className="font-mono text-[10px] text-text-muted">{task.key}</span>
                    <span className="truncate">{task.title}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {projects && projects.length > 0 && (
              <Command.Group heading="Projects" className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {projects.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`${p.key} ${p.name}`}
                    onSelect={() => { onClose(); navigate(`/projects/${p.key}`); }}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-text data-[selected]:bg-accent/10"
                  >
                    {p.key} — {p.name}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
