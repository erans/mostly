# Mostly Web Frontend — Design Spec

**Date:** 2026-04-06
**Status:** Implemented

## Purpose

A web-based frontend for Mostly — the local-first, agent-friendly task tracker. This gives humans a fast, keyboard-driven interface for viewing and managing tasks, complementing the CLI and MCP server that agents use. Inspired by Linear's UI but simpler and cleaner.

## Scope

This is a v1 "super basic" frontend covering:

- Task list with filtering, grouping, and sorting
- Task detail panel with full CRUD
- Sidebar navigation with projects and preset views
- Command palette (Cmd+K)
- Light and dark themes
- Responsive layout (desktop, tablet, mobile)

Out of scope for v1: real-time updates (WebSocket/SSE), drag-and-drop, custom views/saved filters, board/kanban view, notifications, multi-workspace switching.

## Architecture

### Package Structure

New package `@mostly/web` in the monorepo:

```
packages/
  web/
    src/
      api/              ← Typed HTTP client for the Hono API
        client.ts       ← fetch wrapper, base URL, auth header
        tasks.ts        ← listTasks, getTask, createTask, editTask, transitionTask, claimTask, releaseTask, addTaskUpdate
        projects.ts     ← listProjects, getProject
        principals.ts   ← listPrincipals
      components/       ← Shared UI components (shadcn/ui customized)
        ui/             ← shadcn/ui primitives (button, dropdown, dialog, command, etc.)
        status-icon.tsx ← Status indicator icons
        task-row.tsx    ← Single task row in the list
        update-item.tsx ← Single update in the timeline
      features/
        tasks/          ← Task list view, task detail panel, create/edit forms
        projects/       ← Project list (sidebar-driven)
        command/        ← Command palette (Cmd+K)
      hooks/
        use-keyboard.ts ← Keyboard shortcut registration
        use-theme.ts    ← Theme toggle logic
      lib/
        theme.ts        ← CSS variable definitions, theme persistence
        shortcuts.ts    ← Shortcut definitions and handler
      App.tsx
      main.tsx
    index.html
    package.json
    vite.config.ts
    tailwind.config.ts
    postcss.config.js
    tsconfig.json
```

### Dependencies

**Internal:**
- `@mostly/types` — Reuses existing Zod schemas, enums, TypeScript types. No duplication.

**External:**
- `react`, `react-dom` — UI library
- `react-router` — Client-side routing
- `@tanstack/react-query` — Server state management (caching, refetching, optimistic updates)
- `tailwindcss` — Utility-first CSS
- shadcn/ui components (copied into project, not a package dependency)
- `lucide-react` — Monochrome stroke-based icons
- `cmdk` — Command palette primitive (used by shadcn/ui's command component)

**Not depended on:** `@mostly/core`, `@mostly/db`, `@mostly/server`. The web package is a pure API client.

### Data Flow

```
Browser → @mostly/web → HTTP fetch → @mostly/server (localhost:6080) → SQLite
```

The web app connects to the running Mostly server over HTTP. Auth token is entered on first load and stored in localStorage.

### State Management

- **Server state:** TanStack Query handles all API data — caching, background refetching, optimistic updates, cursor-based pagination. Query keys map to API endpoints.
- **Local UI state:** React context for sidebar open/closed, selected theme. URL params for current view, selected task, active filters.
- No Redux, Zustand, or global stores.

## Layout

### Three-Panel Layout

The primary layout has three panels:

1. **Sidebar** (left) — Navigation: workspace, views, projects
2. **Task list** (center) — Dense, scrollable list of tasks
3. **Detail panel** (right) — Full task information, visible when a task is selected

The sidebar has two parts: a narrow icon rail (always visible on desktop/tablet) and an expanded panel with labels and counts.

### Responsive Breakpoints

| Breakpoint | Layout |
|-----------|--------|
| Desktop (≥1024px) | Full three-panel: icon rail + expanded sidebar + task list + detail panel |
| Tablet (768–1023px) | Icon rail only (expanded sidebar hidden) + task list + detail panel |
| Mobile (<768px) | Single panel navigation stack. Hamburger menu for sidebar. Tap task → detail pushes on top. Back arrow returns to list. |

Panels show/hide based on breakpoint. On mobile, selecting a task pushes the detail view onto a navigation stack.

## Sidebar

### Structure

- **Workspace icon** — "M" badge at top of icon rail
- **Search bar** — Opens command palette. Shows `⌘K` hint.
- **My Tasks** — Default landing view. Tasks assigned to the current principal. Shows count badge.
- **All Tasks** — Every task in the workspace. Shows count.
- **Projects section** — Auto-populated from API. Each project has a colored dot and task count. Click filters the task list to that project.
- **Views section** — Preset filtered views:
  - "Blocked" — Tasks with `blocked` status
  - "Active Claims" — Tasks with live claims
- **Current user** — Principal avatar/initial and handle at the bottom. Theme toggle accessible from settings.

### Icon Style

All navigation icons use Lucide React — consistent stroke-based, single-color icons. Icons inherit the current muted text color. Active nav item gets slightly brighter text but remains monochrome.

**Color is reserved exclusively for meaningful indicators:** status circles, project color dots, type/kind badges, and interactive accent highlights. Icons are never individually colored.

## Task List View

### Row Layout

Each task is a dense, single-line row. Information hierarchy left to right:

1. **Status icon** — Circular/shaped indicator (see Status Icons below)
2. **Task key** — Monospace, muted (e.g., `AUTH-42`)
3. **Title** — Primary text, medium weight, takes remaining space
4. **Type badge** — Colored pill (feature, bug, chore, research, incident, question)
5. **Assignee** — Handle text, right-aligned, muted

Selected row has an accent left border and subtle background highlight.

### Status Icons

Each of Mostly's 6 statuses has a distinct icon:

| Status | Icon | Color |
|--------|------|-------|
| `open` | Empty circle | Gray (text-secondary) |
| `claimed` | Circle with small center dot | Blue (#3b82f6) |
| `in_progress` | Circle with larger center dot | Amber (#f59e0b) |
| `blocked` | Rounded square with "!" | Red (#ef4444) |
| `closed` | Filled circle with checkmark | Purple (#8b5cf6) |
| `canceled` | Filled circle with X | Gray (border color) |

### Toolbar

Row of controls above the task list:

- **View title** — "All Tasks", "My Tasks", project name, or view name
- **Filter** — Dropdown to filter by: status, project, type, assignee, claimed_by
- **Group** — Dropdown to group by: status (default), project, type, assignee, or none
- **Sort** — Dropdown to sort by: created (newest first), updated, key, status

### Grouping

When grouped (e.g., by status), tasks appear under collapsible section headers. Each header shows the group label, its icon/color, and item count.

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `j` / `k` | Move selection down/up |
| `Enter` | Open selected task in detail panel |
| `c` | Create new task |
| `x` | Claim/release selected task |
| `s` | Change status of selected task |

## Task Detail Panel

### Header

- **Task key** (monospace, muted) + **type badge** on the left
- **Overflow menu** (⋯) and **close button** (×) on the right
- **Title** — Large, bold, prominent

### Properties Grid

Two-column grid (label | value):

| Property | Display | Interactive? |
|----------|---------|-------------|
| Status | Status icon + label | Click → dropdown with valid transitions only (uses state machine) |
| Project | Color dot + project key | Read-only |
| Assignee | Avatar initial + handle | Click → dropdown, search principals |
| Claimed by | Avatar initial + handle + TTL countdown | Shows "Claim" button if unclaimed |
| Type | Label text | Click → dropdown (feature, bug, chore, research, incident, question) |
| Created | Relative time | Read-only |
| Updated | Relative time | Read-only |

### Description

Section below properties showing the task description text. Editable inline when Edit is activated.

### Action Bar

Row of buttons below the description:

- **Transition →** (primary/accent) — Opens modal with target status selector + optional resolution (for closed/canceled)
- **Add Update** — Opens inline form with update kind selector (note, progress, plan, decision, handoff, result) + text area
- **Edit** — Makes title and description editable inline

### Updates Timeline

Chronological feed below the action bar. Each update shows:

- **Avatar** (initial circle) with connecting vertical line between entries
- **Principal handle** (bold) + **update kind badge** (colored pill: note, progress, decision, etc.)
- **Relative timestamp** (right-aligned, muted)
- **Update content** (text body)

System events (claimed, transitioned, etc.) appear as compact single-line entries with a gear icon.

## Command Palette

Triggered by `⌘K` (or `Ctrl+K`). Built on shadcn/ui's command component (which uses cmdk).

**Sections:**
- **Tasks** — Search by title or key, select to open in detail panel
- **Projects** — Jump to a project view
- **Actions** — "Create task", "Show blocked", "Toggle theme"

Type-ahead filtering across all sections. Recent items shown by default before typing.

## Theming

### Approach

- All colors defined as CSS custom properties on `:root` (light) and `[data-theme="dark"]` (dark)
- Tailwind configured with `darkMode: ['selector', '[data-theme="dark"]']`
- Theme toggle persisted to localStorage
- Default: system preference (`prefers-color-scheme`), overridden by manual toggle

### Light Palette

Warm stone tones — subtle warmth, not sterile white.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#fafaf9` | Page background, sidebar expanded |
| `--surface` | `#ffffff` | Task list, detail panel |
| `--border` | `#e7e5e4` | Dividers, input borders |
| `--text` | `#1c1917` | Primary text |
| `--text-secondary` | `#57534e` | Muted text, labels |
| `--text-muted` | `#a8a29e` | Placeholder, disabled |
| `--accent` | `#6366f1` | Primary actions, selected indicators |
| `--sidebar-bg` | `#f5f5f4` | Icon rail, sidebar background |

### Dark Palette

Near-black — true dark, not muddy gray.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#111111` | Page background, sidebar expanded |
| `--surface` | `#171717` | Task list, detail panel |
| `--border` | `#2a2a2a` | Dividers, input borders |
| `--text` | `#fafaf9` | Primary text |
| `--text-secondary` | `#a8a29e` | Muted text, labels |
| `--text-muted` | `#57534e` | Placeholder, disabled |
| `--accent` | `#818cf8` | Primary actions (slightly lighter for dark bg) |
| `--sidebar-bg` | `#1a1a1a` | Icon rail, sidebar background |

### Status Colors (Shared)

These remain constant across themes:

| Status | Color |
|--------|-------|
| `open` | `var(--text-secondary)` (adapts to theme) |
| `claimed` | `#3b82f6` |
| `in_progress` | `#f59e0b` |
| `blocked` | `#ef4444` |
| `closed` | `#8b5cf6` |
| `canceled` | `var(--border)` (adapts to theme) |

### Type Badge Colors (Shared)

Each type gets a subtle tinted background with matching text:

| Type | Color |
|------|-------|
| `feature` | Purple (#8b5cf6) |
| `bug` | Red (#ef4444) |
| `chore` | Cyan (#06b6d4) |
| `research` | Green (#10b981) |
| `incident` | Orange (#f97316) |
| `question` | Amber (#f59e0b) |

## Routing

URL structure using React Router:

| Route | View |
|-------|------|
| `/` | Redirect to `/tasks/my` |
| `/tasks/my` | My Tasks (assigned to current principal) |
| `/tasks/all` | All Tasks |
| `/tasks/all/:taskId` | All Tasks with detail panel open for taskId |
| `/projects/:projectKey` | Tasks filtered by project |
| `/projects/:projectKey/:taskId` | Project tasks with detail panel open |
| `/views/blocked` | Blocked tasks view |
| `/views/claims` | Active claims view |

The selected task ID in the URL controls whether the detail panel is open. Navigating to a URL with a taskId opens the panel; removing it closes it.

## API Client

Thin typed wrapper around `fetch`. Each function returns the typed response using types from `@mostly/types`.

```typescript
// Example shape — not implementation code
const client = createApiClient({ baseUrl: 'http://localhost:6080', token: '...' })

client.tasks.list({ status: 'open', project_id: '...' })  // → { data: { items: Task[], next_cursor: string | null } }
client.tasks.get(taskId)                                     // → { data: Task }
client.tasks.create({ title, project_id, type, ... })        // → { data: Task }
client.tasks.transition(taskId, { status, resolution? })     // → { data: Task }
client.tasks.claim(taskId)                                    // → { data: Task }
```

All API calls go through TanStack Query hooks:

- `useTaskList(filters)` — paginated query with cursor support
- `useTask(taskId)` — single task query
- `useCreateTask()` — mutation with list invalidation
- `useTransitionTask()` — mutation with optimistic update
- `useClaimTask()` — mutation with optimistic update

## First-Load Experience

On first load with no stored config:

1. Simple setup screen asking for the API server URL (default: `http://localhost:6080`) and auth token
2. Validates by calling the API (e.g., list principals)
3. On success, persists to localStorage and proceeds to My Tasks view
4. Settings accessible later from the user menu at the bottom of the sidebar

## Technology Summary

| Concern | Choice |
|---------|--------|
| Framework | React 19 + Vite |
| Routing | React Router v7 |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui (copied, not dependency) |
| Icons | Lucide React (monochrome, stroke-based) |
| Server state | TanStack Query v5 |
| Command palette | cmdk (via shadcn/ui command) |
| Types | @mostly/types (shared Zod schemas) |
| Build | Vite (dev server + production build) |
