import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface TabbedDialogProps {
  title: string;
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function TabbedDialog({ title, tabs, activeTab, onTabChange, onClose, children, footer }: TabbedDialogProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
      >
        {/* Left: tabs */}
        <div className="flex w-44 shrink-0 flex-col border-r border-border bg-bg p-3">
          <div className="mb-3 px-2 text-xs font-bold uppercase tracking-wide text-text-muted">{title}</div>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  activeTab === tab.id
                    ? 'bg-border/50 font-medium text-text'
                    : 'text-text-secondary hover:bg-border/30',
                )}
              >
                <Icon size={14} className="shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
          {footer && <div className="mt-auto pt-3">{footer}</div>}
        </div>

        {/* Right: content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-end border-b border-border px-4 py-2">
            <button type="button" onClick={onClose} aria-label="Close">
              <X size={16} className="text-text-muted hover:text-text" />
            </button>
          </div>
          <div className="max-h-[60vh] flex-1 overflow-y-auto p-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
