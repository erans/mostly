import { useState } from 'react';
import { X } from 'lucide-react';
import { useCreateProject } from '@/hooks/use-projects';

interface ProjectFormProps {
  onClose: () => void;
}

export function ProjectForm({ onClose }: ProjectFormProps) {
  const createMutation = useCreateProject();

  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  function handleKeyChange(value: string) {
    setKey(value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || !name.trim()) return;
    createMutation.mutate({
      key: key.trim(),
      name: name.trim(),
      description: description.trim() || null,
    }, {
      onSuccess: () => onClose(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-lg"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">New Project</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} className="text-text-muted" />
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <input
            autoFocus
            type="text"
            value={key}
            onChange={(e) => handleKeyChange(e.target.value)}
            placeholder="KEY"
            className="w-28 rounded border border-border bg-bg px-3 py-2 text-sm font-mono text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
            required
            maxLength={10}
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="flex-1 rounded border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
            required
          />
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="mb-4 w-full resize-none rounded border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          rows={3}
        />

        {createMutation.error && (
          <p role="alert" className="mb-3 text-sm text-status-blocked">
            {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create project.'}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-border px-3 py-1.5 text-[12px] hover:bg-border/30">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!key.trim() || !name.trim() || createMutation.isPending}
            className="rounded bg-accent px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
