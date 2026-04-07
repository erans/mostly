import { NavLink, useLocation } from 'react-router';
import { ListTodo, List, FolderOpen, Settings, Clock, Ban, Search, Plus } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { useConfig } from '@/hooks/use-config';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

interface SidebarProps {
  expanded: boolean;
  onToggle: () => void;
  onCommandPalette: () => void;
}

const PROJECT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

export function Sidebar({ expanded, onToggle, onCommandPalette }: SidebarProps) {
  const { data: projects } = useProjects();
  const { config } = useConfig();
  const { toggleTheme } = useTheme();
  const location = useLocation();

  const navLinkClass = (isActive: boolean) =>
    cn(
      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
      isActive ? 'bg-border/50 font-medium text-text' : 'text-text-secondary hover:bg-border/30',
    );

  return (
    <aside className="flex h-full shrink-0">
      {/* Icon rail */}
      <div className="flex w-11 flex-col items-center gap-1.5 border-r border-border bg-sidebar px-1 py-3">
        <button
          onClick={onToggle}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-bold text-white"
        >
          M
        </button>
        <div className="my-1 h-px w-5 bg-border" />
        <NavLink to="/tasks/my" className={({ isActive }) => cn('flex h-7 w-7 items-center justify-center rounded-md', isActive ? 'bg-border/60' : 'hover:bg-border/30')}>
          <ListTodo size={15} className="text-text-secondary" />
        </NavLink>
        <NavLink to="/tasks/all" className={({ isActive }) => cn('flex h-7 w-7 items-center justify-center rounded-md', isActive ? 'bg-border/60' : 'hover:bg-border/30')}>
          <List size={15} className="text-text-secondary" />
        </NavLink>
        <NavLink to="/projects" className={({ isActive }) => cn('flex h-7 w-7 items-center justify-center rounded-md', isActive && !location.pathname.startsWith('/tasks') ? 'bg-border/60' : 'hover:bg-border/30')}>
          <FolderOpen size={15} className="text-text-secondary" />
        </NavLink>
        <div className="flex-1" />
        <button onClick={toggleTheme} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-border/30">
          <Settings size={15} className="text-text-secondary" />
        </button>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="flex w-48 flex-col border-r border-border bg-bg px-2 py-3">
          {/* Search trigger */}
          <button
            onClick={onCommandPalette}
            className="mb-3 flex items-center gap-2 rounded-md border border-border bg-sidebar px-2 py-1.5 text-left"
          >
            <Search size={12} className="text-text-muted" />
            <span className="flex-1 text-xs text-text-muted">Search...</span>
            <kbd className="rounded bg-border/50 px-1 text-[10px] font-mono text-text-muted">&#x2318;K</kbd>
          </button>

          {/* Main nav */}
          <NavLink to="/tasks/my" className={({ isActive }) => navLinkClass(isActive)}>
            <ListTodo size={14} className="shrink-0" />
            <span>My Tasks</span>
          </NavLink>
          <NavLink to="/tasks/all" className={({ isActive }) => navLinkClass(isActive)}>
            <List size={14} className="shrink-0" />
            <span>All Tasks</span>
          </NavLink>

          <div className="my-2 h-px bg-border" />

          {/* Projects */}
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Projects</span>
            <Plus size={12} className="cursor-pointer text-text-muted opacity-40 hover:opacity-100" />
          </div>
          {projects?.map((p, i) => (
            <NavLink
              key={p.id}
              to={`/projects/${p.key}`}
              className={({ isActive }) => navLinkClass(isActive)}
            >
              <div
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length] }}
              />
              <span>{p.key}</span>
            </NavLink>
          ))}

          <div className="my-2 h-px bg-border" />

          {/* Views */}
          <div className="mb-1 px-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Views</span>
          </div>
          <NavLink to="/views/blocked" className={({ isActive }) => navLinkClass(isActive)}>
            <Ban size={14} className="shrink-0" />
            <span>Blocked</span>
          </NavLink>
          <NavLink to="/views/claims" className={({ isActive }) => navLinkClass(isActive)}>
            <Clock size={14} className="shrink-0" />
            <span>Active Claims</span>
          </NavLink>

          {/* Current user */}
          <div className="mt-auto flex items-center gap-2 border-t border-border px-2 pt-3">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-border/50 text-[10px] font-semibold text-text-secondary">
              {config?.principalHandle?.[0]?.toUpperCase() ?? '?'}
            </div>
            <span className="text-xs text-text-secondary">{config?.principalHandle}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
