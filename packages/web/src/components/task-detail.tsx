import { useState } from 'react';
import type { Task, TaskStatus, Resolution } from '@mostly/types';
import { X, MoreHorizontal } from 'lucide-react';
import { StatusIcon } from './status-icon';
import { UpdatesTimeline } from './updates-timeline';
import { useTaskUpdates, useTransitionTask, useClaimTask, useReleaseTask, useAddTaskUpdate } from '@/hooks/use-tasks';
import { usePrincipals } from '@/hooks/use-principals';
import { RESOLUTION_FOR_STATUS, ALLOWED_TRANSITIONS } from '@mostly/types';
import { TYPE_COLORS } from '@/lib/constants';
import { relativeTime } from '@/lib/format';

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
}

export function TaskDetail({ task, onClose }: TaskDetailProps) {
  const { data: updatesData } = useTaskUpdates(task.id);
  const { data: principals } = usePrincipals();
  const transitionMutation = useTransitionTask();
  const claimMutation = useClaimTask();
  const releaseMutation = useReleaseTask();
  const addUpdateMutation = useAddTaskUpdate();

  const [showTransition, setShowTransition] = useState(false);
  const [showAddUpdate, setShowAddUpdate] = useState(false);
  const [updateKind, setUpdateKind] = useState<string>('note');
  const [updateBody, setUpdateBody] = useState('');
  const [transitionTo, setTransitionTo] = useState('');
  const [resolution, setResolution] = useState('');

  const principalMap = new Map((principals ?? []).map(p => [p.id, p]));
  const updates = updatesData?.items ?? [];
  const allowedTransitions = ALLOWED_TRANSITIONS[task.status] ?? [];
  const typeColor = TYPE_COLORS[task.type] ?? 'var(--color-text-muted)';

  const assignee = task.assignee_id ? principalMap.get(task.assignee_id) : null;
  const claimer = task.claimed_by_id ? principalMap.get(task.claimed_by_id) : null;

  function handleTransition() {
    if (!transitionTo) return;
    const isTerminal = transitionTo === 'closed' || transitionTo === 'canceled';
    transitionMutation.mutate({
      id: task.id,
      to_status: transitionTo as TaskStatus,
      resolution: isTerminal && resolution ? resolution as Resolution : undefined,
      expected_version: task.version,
    }, {
      onSuccess: () => { setShowTransition(false); setTransitionTo(''); setResolution(''); },
    });
  }

  function handleAddUpdate() {
    if (!updateBody.trim()) return;
    addUpdateMutation.mutate({
      taskId: task.id,
      kind: updateKind as 'note' | 'progress' | 'plan' | 'decision' | 'handoff' | 'result' | 'status' | 'claim' | 'system',
      body: updateBody,
    }, {
      onSuccess: () => { setShowAddUpdate(false); setUpdateBody(''); setUpdateKind('note'); },
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-text-muted">{task.key}</span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{
                backgroundColor: `color-mix(in srgb, ${typeColor} 15%, transparent)`,
                color: typeColor,
              }}
            >
              {task.type}
            </span>
          </div>
          <div className="flex gap-1">
            <button className="flex h-6 w-6 items-center justify-center rounded border border-border hover:bg-border/30">
              <MoreHorizontal size={13} className="text-text-secondary" />
            </button>
            <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded border border-border hover:bg-border/30">
              <X size={13} className="text-text-secondary" />
            </button>
          </div>
        </div>
        <h2 className="text-base font-bold text-text">{task.title}</h2>
      </div>

      {/* Properties */}
      <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 border-b border-border px-4 py-3 text-[12px]">
        <span className="text-text-muted">Status</span>
        <div className="flex items-center gap-1.5">
          <StatusIcon status={task.status} size={12} />
          <span className="capitalize text-text">{task.status.replace('_', ' ')}</span>
        </div>

        <span className="text-text-muted">Assignee</span>
        <span className="text-text">{assignee?.handle ?? '\u2014'}</span>

        <span className="text-text-muted">Claimed by</span>
        <div className="flex items-center gap-1.5">
          <span className="text-text">{claimer?.handle ?? '\u2014'}</span>
          {task.claim_expires_at && (
            <span className="text-[10px] text-text-muted">expires {relativeTime(task.claim_expires_at)}</span>
          )}
        </div>

        <span className="text-text-muted">Created</span>
        <span className="text-text-secondary">{relativeTime(task.created_at)}</span>

        <span className="text-text-muted">Updated</span>
        <span className="text-text-secondary">{relativeTime(task.updated_at)}</span>
      </div>

      {/* Description */}
      {task.description && (
        <div className="border-b border-border px-4 py-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Description</div>
          <p className="text-[12px] leading-relaxed text-text">{task.description}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 border-b border-border px-4 py-2">
        <button
          onClick={() => setShowTransition(!showTransition)}
          disabled={allowedTransitions.length === 0}
          className="rounded bg-accent px-3 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Transition {'\u2192'}
        </button>
        <button
          onClick={() => setShowAddUpdate(!showAddUpdate)}
          className="rounded border border-border px-3 py-1 text-[11px] hover:bg-border/30"
        >
          Add Update
        </button>
        {!task.claimed_by_id ? (
          <button
            onClick={() => claimMutation.mutate({ id: task.id, expected_version: task.version })}
            className="rounded border border-border px-3 py-1 text-[11px] hover:bg-border/30"
          >
            Claim
          </button>
        ) : (
          <button
            onClick={() => releaseMutation.mutate({ id: task.id, expected_version: task.version })}
            className="rounded border border-border px-3 py-1 text-[11px] hover:bg-border/30"
          >
            Release
          </button>
        )}
      </div>

      {/* Transition form */}
      {showTransition && (
        <div className="space-y-2 border-b border-border px-4 py-3">
          <select
            value={transitionTo}
            onChange={(e) => { setTransitionTo(e.target.value); setResolution(''); }}
            className="w-full rounded border border-border bg-bg px-2 py-1 text-[12px] focus:outline-none"
          >
            <option value="">Select status...</option>
            {allowedTransitions.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          {(transitionTo === 'closed' || transitionTo === 'canceled') && (
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="w-full rounded border border-border bg-bg px-2 py-1 text-[12px] focus:outline-none"
            >
              <option value="">Select resolution...</option>
              {(RESOLUTION_FOR_STATUS[transitionTo] ?? []).map((r) => (
                <option key={r} value={r}>{r.replace('_', ' ')}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleTransition}
            disabled={!transitionTo || transitionMutation.isPending}
            className="rounded bg-accent px-3 py-1 text-[11px] text-white disabled:opacity-40"
          >
            {transitionMutation.isPending ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      )}

      {/* Add update form */}
      {showAddUpdate && (
        <div className="space-y-2 border-b border-border px-4 py-3">
          <select
            value={updateKind}
            onChange={(e) => setUpdateKind(e.target.value)}
            className="w-full rounded border border-border bg-bg px-2 py-1 text-[12px] focus:outline-none"
          >
            {['note', 'progress', 'plan', 'decision', 'handoff', 'result'].map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <textarea
            value={updateBody}
            onChange={(e) => setUpdateBody(e.target.value)}
            placeholder="Write an update..."
            className="w-full resize-none rounded border border-border bg-bg px-2 py-1 text-[12px] focus:outline-none"
            rows={3}
          />
          <button
            onClick={handleAddUpdate}
            disabled={!updateBody.trim() || addUpdateMutation.isPending}
            className="rounded bg-accent px-3 py-1 text-[11px] text-white disabled:opacity-40"
          >
            {addUpdateMutation.isPending ? 'Saving...' : 'Add Update'}
          </button>
        </div>
      )}

      {/* Updates timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Updates</div>
        {updates.length > 0 ? (
          <UpdatesTimeline updates={updates} principals={principalMap} />
        ) : (
          <p className="text-[12px] text-text-muted">No updates yet</p>
        )}
      </div>
    </div>
  );
}
