import type { TaskStatus } from '@mostly/types';

const iconSize = 14;

export function StatusIcon({ status, size = iconSize }: { status: TaskStatus; size?: number }) {
  const r = size / 2;
  const cx = r;
  const cy = r;
  const strokeWidth = 2;
  const innerR = size < 16 ? 2.5 : 3;

  switch (status) {
    case 'open':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
          <circle cx={cx} cy={cy} r={r - strokeWidth / 2} stroke="var(--color-status-open)" strokeWidth={strokeWidth} />
        </svg>
      );
    case 'claimed':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
          <circle cx={cx} cy={cy} r={r - strokeWidth / 2} stroke="var(--color-status-claimed)" strokeWidth={strokeWidth} />
          <circle cx={cx} cy={cy} r={innerR - 0.5} fill="var(--color-status-claimed)" />
        </svg>
      );
    case 'in_progress':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
          <circle cx={cx} cy={cy} r={r - strokeWidth / 2} stroke="var(--color-status-in-progress)" strokeWidth={strokeWidth} />
          <circle cx={cx} cy={cy} r={innerR} fill="var(--color-status-in-progress)" />
        </svg>
      );
    case 'blocked':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
          <rect x={1} y={1} width={size - 2} height={size - 2} rx={3} fill="var(--color-status-blocked)" />
          <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={size * 0.6} fontWeight="bold">!</text>
        </svg>
      );
    case 'closed':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
          <circle cx={cx} cy={cy} r={r - 0.5} fill="var(--color-status-closed)" />
          <path d={`M${cx - 2.5} ${cy} L${cx - 0.5} ${cy + 2} L${cx + 2.5} ${cy - 2}`} stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'canceled':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
          <circle cx={cx} cy={cy} r={r - 0.5} fill="var(--color-status-canceled)" />
          <path d={`M${cx - 2} ${cy - 2} L${cx + 2} ${cy + 2} M${cx + 2} ${cy - 2} L${cx - 2} ${cy + 2}`} stroke="white" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      );
  }
}
