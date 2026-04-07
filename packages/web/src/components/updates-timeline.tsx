import type { TaskUpdate, Principal } from '@mostly/types';

const KIND_COLORS: Record<string, string> = {
  note: '#3b82f6',
  progress: '#10b981',
  plan: '#6366f1',
  decision: '#f59e0b',
  handoff: '#f97316',
  result: '#8b5cf6',
  status: 'var(--color-text-muted)',
  claim: 'var(--color-text-muted)',
  system: 'var(--color-text-muted)',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface UpdatesTimelineProps {
  updates: TaskUpdate[];
  principals: Map<string, Principal>;
}

export function UpdatesTimeline({ updates, principals }: UpdatesTimelineProps) {
  const isSystem = (kind: string) => kind === 'status' || kind === 'claim' || kind === 'system';

  return (
    <div className="space-y-0">
      {updates.map((update, i) => {
        const principal = principals.get(update.created_by_id);
        const handle = principal?.handle ?? 'unknown';
        const initial = handle[0]?.toUpperCase() ?? '?';
        const kindColor = KIND_COLORS[update.kind] ?? 'var(--color-text-muted)';
        const isLast = i === updates.length - 1;

        if (isSystem(update.kind)) {
          return (
            <div key={update.id} className="flex items-start gap-2.5 py-1.5">
              <div className="flex w-5 flex-col items-center">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-border/50 text-[9px] text-text-muted">{'\u2699'}</div>
              </div>
              <div className="flex flex-1 items-center justify-between">
                <span className="text-[11px] text-text-muted">
                  <span className="font-medium">{handle}</span> {update.body}
                </span>
                <span className="shrink-0 text-[10px] text-text-muted/50">{relativeTime(update.created_at)}</span>
              </div>
            </div>
          );
        }

        return (
          <div key={update.id} className="flex items-start gap-2.5 py-2">
            <div className="flex flex-col items-center">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-[9px] font-semibold text-text-secondary">
                {initial}
              </div>
              {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
            </div>
            <div className="flex-1">
              <div className="mb-0.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-semibold text-text">{handle}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px]"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${kindColor} 15%, transparent)`,
                      color: kindColor,
                    }}
                  >
                    {update.kind}
                  </span>
                </div>
                <span className="text-[10px] text-text-muted/50">{relativeTime(update.created_at)}</span>
              </div>
              <p className="text-[12px] leading-relaxed text-text">{update.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
