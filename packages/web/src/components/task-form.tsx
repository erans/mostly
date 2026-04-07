import { useState } from 'react';
import { X } from 'lucide-react';
import { TaskType } from '@mostly/types';
import { useCreateTask } from '@/hooks/use-tasks';
import { useProjects } from '@/hooks/use-projects';

interface TaskFormProps {
  onClose: () => void;
  defaultProjectId?: string | null;
}

export function TaskForm({ onClose, defaultProjectId }: TaskFormProps) {
  const { data: projects } = useProjects();
  const createMutation = useCreateTask();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('feature');
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [description, setDescription] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    createMutation.mutate({
      title: title.trim(),
      type,
      project_id: projectId || null,
      description: description.trim() || null,
    }, {
      onSuccess: () => onClose(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-lg"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">New Task</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} className="text-text-muted" />
          </button>
        </div>

        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          className="mb-3 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          required
        />

        <div className="mb-3 flex gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TaskType)}
            className="flex-1 rounded border border-border bg-bg px-2 py-1.5 text-[12px] text-text focus:outline-none"
          >
            {Object.values(TaskType).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="flex-1 rounded border border-border bg-bg px-2 py-1.5 text-[12px] text-text focus:outline-none"
          >
            <option value="">No project</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>{p.key} — {p.name}</option>
            ))}
          </select>
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="mb-4 w-full resize-none rounded border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          rows={4}
        />

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-border px-3 py-1.5 text-[12px] hover:bg-border/30">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || createMutation.isPending}
            className="rounded bg-accent px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  );
}
