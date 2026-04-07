import { useState } from 'react';
import { Sidebar } from './sidebar';

interface LayoutProps {
  children: React.ReactNode;
  detail?: React.ReactNode;
  onCommandPalette: () => void;
}

export function Layout({ children, detail, onCommandPalette }: LayoutProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar
        expanded={sidebarExpanded}
        onToggle={() => setSidebarExpanded(!sidebarExpanded)}
        onCommandPalette={onCommandPalette}
      />
      <main className="flex min-w-0 flex-1">
        <div className="flex-1 overflow-y-auto">{children}</div>
        {detail && (
          <div className="w-[380px] shrink-0 overflow-y-auto border-l border-border bg-surface">
            {detail}
          </div>
        )}
      </main>
    </div>
  );
}
