import { useState, useEffect, type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { useResizable } from '@/hooks/use-resizable';

interface LayoutProps {
  children: ReactNode;
  detail?: ReactNode;
  onCommandPalette: () => void;
  onCloseDetail?: () => void;
}

function useBreakpoint() {
  const [bp, setBp] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  useEffect(() => {
    function update() {
      if (window.innerWidth < 768) setBp('mobile');
      else if (window.innerWidth < 1024) setBp('tablet');
      else setBp('desktop');
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return bp;
}

export function Layout({ children, detail, onCommandPalette, onCloseDetail }: LayoutProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const bp = useBreakpoint();
  const { width: detailWidth, handleMouseDown } = useResizable({
    storageKey: 'mostly-detail-width',
    defaultWidth: 380,
    minWidth: 280,
    maxWidth: 700,
  });

  // Auto-collapse sidebar on tablet
  const showExpandedSidebar = bp === 'desktop' ? sidebarExpanded : false;
  const showIconRail = bp !== 'mobile';
  const showDetail = !!detail;

  // Mobile: show either list or detail, not both
  if (bp === 'mobile') {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-bg">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between border-b border-border bg-sidebar px-3 py-2">
          {showDetail && onCloseDetail ? (
            <button onClick={onCloseDetail} aria-label="Back to list" className="text-text-secondary text-lg">{'\u2190'}</button>
          ) : (
            <button onClick={() => setMobileMenuOpen(true)} aria-label="Open menu" className="text-text-secondary text-lg">{'\u2630'}</button>
          )}
          <span className="text-sm font-bold text-text">Mostly</span>
          <button onClick={onCommandPalette} aria-label="Search" className="text-text-secondary text-lg">{'\u2318'}</button>
        </div>

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 flex">
            <div className="w-64 bg-bg shadow-lg">
              <Sidebar expanded={true} onToggle={() => setMobileMenuOpen(false)} onCommandPalette={onCommandPalette} />
            </div>
            <div className="flex-1 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Content: either detail or list */}
        <div className="flex-1 overflow-y-auto">
          {showDetail ? detail : children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {showIconRail && (
        <Sidebar
          expanded={showExpandedSidebar}
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
          onCommandPalette={onCommandPalette}
        />
      )}
      <main className="flex min-w-0 flex-1">
        <div className="flex-1 overflow-y-auto">{children}</div>
        {showDetail && (
          <div className="relative shrink-0 overflow-y-auto border-l border-border bg-surface" style={{ width: detailWidth }}>
            <div
              onMouseDown={handleMouseDown}
              className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-accent/30 active:bg-accent/50"
            />
            {detail}
          </div>
        )}
      </main>
    </div>
  );
}
