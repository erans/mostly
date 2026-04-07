# Mostly Web Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a Linear-inspired web frontend for the Mostly task tracker as `@mostly/web` in the monorepo.

**Architecture:** React SPA (Vite) talking to the existing Hono HTTP API over fetch. TanStack Query for server state, React Router for navigation, Tailwind CSS for styling, shadcn/ui for component primitives, Lucide React for monochrome icons.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query v5, React Router v7, Lucide React, cmdk

**Spec:** `docs/superpowers/specs/2026-04-06-web-frontend-design.md`

---

## File Structure

```
packages/web/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── components.json                  ← shadcn/ui config
├── src/
│   ├── main.tsx                     ← React root mount
│   ├── App.tsx                      ← Router + providers
│   ├── globals.css                  ← Tailwind imports + CSS variables
│   ├── lib/
│   │   └── utils.ts                 ← cn() helper for class merging
│   ├── api/
│   │   ├── client.ts                ← fetch wrapper, base URL, auth header
│   │   ├── tasks.ts                 ← Task API functions
│   │   ├── projects.ts              ← Project API functions
│   │   └── principals.ts            ← Principal API functions
│   ├── hooks/
│   │   ├── use-tasks.ts             ← TanStack Query hooks for tasks
│   │   ├── use-projects.ts          ← TanStack Query hooks for projects
│   │   ├── use-principals.ts        ← TanStack Query hooks for principals
│   │   ├── use-config.ts            ← Config context (server URL, token, principal)
│   │   ├── use-theme.ts             ← Theme toggle hook
│   │   └── use-keyboard.ts          ← Keyboard shortcut registration
│   ├── components/
│   │   ├── ui/                      ← shadcn/ui primitives (added via CLI)
│   │   ├── layout.tsx               ← Three-panel shell
│   │   ├── sidebar.tsx              ← Icon rail + expanded sidebar
│   │   ├── status-icon.tsx          ← Status indicator SVGs
│   │   ├── task-row.tsx             ← Single task row
│   │   ├── task-list.tsx            ← Task list with toolbar + grouping
│   │   ├── task-detail.tsx          ← Detail panel content
│   │   ├── task-form.tsx            ← Create/edit task form
│   │   ├── updates-timeline.tsx     ← Updates feed + add update form
│   │   ├── command-palette.tsx      ← Cmd+K palette
│   │   ├── transition-dialog.tsx    ← Status transition modal
│   │   └── setup-screen.tsx         ← First-load config form
│   └── pages/
│       ├── tasks.tsx                ← /tasks/my and /tasks/all routes
│       └── project-tasks.tsx        ← /projects/:key routes
```

---

## Task 1: Package Scaffolding

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/src/App.tsx`
- Create: `packages/web/src/globals.css`
- Create: `packages/web/src/lib/utils.ts`

- [x] **Step 1: Create package.json**

```json
{
  "name": "@mostly/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@mostly/types": "workspace:*",
    "@tanstack/react-query": "^5.75.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "lucide-react": "^0.487.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router": "^7.5.0",
    "tailwind-merge": "^3.2.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.4",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.4.1",
    "tailwindcss": "^4.1.4",
    "typescript": "^5.8.3",
    "vite": "^6.3.2",
    "vitest": "^3.1.1"
  }
}
```

Write to `packages/web/package.json`.

- [x] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "declaration": false,
    "declarationMap": false,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"]
}
```

Write to `packages/web/tsconfig.json`.

- [x] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/v0': {
        target: 'http://localhost:6080',
        changeOrigin: true,
      },
    },
  },
});
```

Write to `packages/web/vite.config.ts`.

- [x] **Step 4: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mostly</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Write to `packages/web/index.html`.

- [x] **Step 5: Create globals.css with theme variables**

```css
@import "tailwindcss";

@theme {
  --color-bg: #fafaf9;
  --color-surface: #ffffff;
  --color-border: #e7e5e4;
  --color-text: #1c1917;
  --color-text-secondary: #57534e;
  --color-text-muted: #a8a29e;
  --color-accent: #6366f1;
  --color-accent-light: #818cf8;
  --color-sidebar: #f5f5f4;

  --color-status-open: #78716c;
  --color-status-claimed: #3b82f6;
  --color-status-in-progress: #f59e0b;
  --color-status-blocked: #ef4444;
  --color-status-closed: #8b5cf6;
  --color-status-canceled: #a8a29e;

  --color-type-feature: #8b5cf6;
  --color-type-bug: #ef4444;
  --color-type-chore: #06b6d4;
  --color-type-research: #10b981;
  --color-type-incident: #f97316;
  --color-type-question: #f59e0b;
}

[data-theme="dark"] {
  --color-bg: #111111;
  --color-surface: #171717;
  --color-border: #2a2a2a;
  --color-text: #fafaf9;
  --color-text-secondary: #a8a29e;
  --color-text-muted: #57534e;
  --color-accent: #818cf8;
  --color-accent-light: #a5b4fc;
  --color-sidebar: #1a1a1a;

  --color-status-open: #a8a29e;
  --color-status-canceled: #57534e;
}

body {
  margin: 0;
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}

* {
  border-color: var(--color-border);
}
```

Write to `packages/web/src/globals.css`.

- [x] **Step 6: Create lib/utils.ts**

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Write to `packages/web/src/lib/utils.ts`.

- [x] **Step 7: Create main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Write to `packages/web/src/main.tsx`.

- [x] **Step 8: Create App.tsx (minimal placeholder)**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex h-screen items-center justify-center text-text-secondary">
          Mostly — loading...
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

Write to `packages/web/src/App.tsx`.

- [x] **Step 9: Install dependencies and verify dev server starts**

```bash
cd packages/web && pnpm install
```

```bash
cd packages/web && pnpm dev &
sleep 3 && curl -s http://localhost:5173 | head -20
kill %1
```

Expected: HTML page loads with `<div id="root">`.

- [x] **Step 10: Commit**

```bash
git add packages/web/
git commit -m "feat(web): scaffold @mostly/web package with Vite, React, Tailwind"
```

---

## Task 2: API Client

**Files:**
- Create: `packages/web/src/api/client.ts`
- Create: `packages/web/src/api/tasks.ts`
- Create: `packages/web/src/api/projects.ts`
- Create: `packages/web/src/api/principals.ts`
- Create: `packages/web/src/hooks/use-config.ts`

- [x] **Step 1: Create the config context**

This stores the server URL, auth token, and current principal handle. Persisted to localStorage.

```tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface AppConfig {
  serverUrl: string;
  token: string;
  principalHandle: string;
}

interface ConfigContextValue {
  config: AppConfig | null;
  setConfig: (config: AppConfig) => void;
  clearConfig: () => void;
}

const STORAGE_KEY = 'mostly-config';

function loadConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.serverUrl && parsed.token && parsed.principalHandle) return parsed;
    return null;
  } catch {
    return null;
  }
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<AppConfig | null>(loadConfig);

  const setConfig = useCallback((c: AppConfig) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    setConfigState(c);
  }, []);

  const clearConfig = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setConfigState(null);
  }, []);

  return (
    <ConfigContext.Provider value={{ config, setConfig, clearConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider');
  return ctx;
}
```

Write to `packages/web/src/hooks/use-config.ts`.

- [x] **Step 2: Create the fetch wrapper**

```typescript
import type { ApiErrorResponse } from '@mostly/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ClientConfig {
  baseUrl: string;
  token: string;
}

let globalConfig: ClientConfig | null = null;

export function setClientConfig(config: ClientConfig) {
  globalConfig = config;
}

export function getClientConfig(): ClientConfig {
  if (!globalConfig) throw new Error('API client not configured — call setClientConfig first');
  return globalConfig;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { baseUrl, token } = getClientConfig();
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    let body: ApiErrorResponse | undefined;
    try {
      body = await res.json();
    } catch {
      // ignore parse errors
    }
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'unknown',
      body?.error?.message ?? `HTTP ${res.status}`,
      body?.error?.details,
    );
  }

  return res.json() as Promise<T>;
}
```

Write to `packages/web/src/api/client.ts`.

- [x] **Step 3: Create tasks API functions**

```typescript
import type {
  Task, TaskUpdate,
  CreateTaskRequest, PatchTaskRequest, TransitionTaskRequest,
  AcquireClaimRequest, ReleaseClaimRequest,
  CreateTaskUpdateRequest, TaskListParams,
} from '@mostly/types';
import { apiFetch } from './client';

interface ListResponse<T> { data: { items: T[]; next_cursor: string | null } }
interface SingleResponse<T> { data: T }

export function listTasks(params: Partial<TaskListParams> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const query = qs.toString();
  return apiFetch<ListResponse<Task>>(`/v0/tasks${query ? `?${query}` : ''}`);
}

export function getTask(id: string) {
  return apiFetch<SingleResponse<Task>>(`/v0/tasks/${encodeURIComponent(id)}`);
}

export function createTask(body: CreateTaskRequest) {
  return apiFetch<SingleResponse<Task>>('/v0/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function editTask(id: string, body: PatchTaskRequest) {
  return apiFetch<SingleResponse<Task>>(`/v0/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function transitionTask(id: string, body: TransitionTaskRequest) {
  return apiFetch<SingleResponse<Task>>(`/v0/tasks/${encodeURIComponent(id)}/transition`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function claimTask(id: string, body: AcquireClaimRequest) {
  return apiFetch<SingleResponse<Task>>(`/v0/tasks/${encodeURIComponent(id)}/claim`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function releaseTask(id: string, body: ReleaseClaimRequest) {
  return apiFetch<SingleResponse<Task>>(`/v0/tasks/${encodeURIComponent(id)}/release-claim`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listTaskUpdates(taskId: string, params: { cursor?: string; limit?: number } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const query = qs.toString();
  return apiFetch<ListResponse<TaskUpdate>>(
    `/v0/tasks/${encodeURIComponent(taskId)}/updates${query ? `?${query}` : ''}`,
  );
}

export function addTaskUpdate(taskId: string, body: CreateTaskUpdateRequest) {
  return apiFetch<SingleResponse<TaskUpdate>>(
    `/v0/tasks/${encodeURIComponent(taskId)}/updates`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}
```

Write to `packages/web/src/api/tasks.ts`.

- [x] **Step 4: Create projects and principals API functions**

```typescript
import type { Project, CreateProjectRequest, ListParams } from '@mostly/types';
import { apiFetch } from './client';

interface ListResponse<T> { data: { items: T[]; next_cursor: string | null } }
interface SingleResponse<T> { data: T }

export function listProjects(params: Partial<ListParams> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const query = qs.toString();
  return apiFetch<ListResponse<Project>>(`/v0/projects${query ? `?${query}` : ''}`);
}

export function getProject(id: string) {
  return apiFetch<SingleResponse<Project>>(`/v0/projects/${encodeURIComponent(id)}`);
}
```

Write to `packages/web/src/api/projects.ts`.

```typescript
import type { Principal, ListParams } from '@mostly/types';
import { apiFetch } from './client';

interface ListResponse<T> { data: { items: T[]; next_cursor: string | null } }

export function listPrincipals(params: Partial<ListParams> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const query = qs.toString();
  return apiFetch<ListResponse<Principal>>(`/v0/principals${query ? `?${query}` : ''}`);
}
```

Write to `packages/web/src/api/principals.ts`.

- [x] **Step 5: Commit**

```bash
git add packages/web/src/api/ packages/web/src/hooks/use-config.ts
git commit -m "feat(web): add typed API client and config context"
```

---

## Task 3: TanStack Query Hooks

**Files:**
- Create: `packages/web/src/hooks/use-tasks.ts`
- Create: `packages/web/src/hooks/use-projects.ts`
- Create: `packages/web/src/hooks/use-principals.ts`

- [x] **Step 1: Create task query hooks**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskListParams, CreateTaskRequest, PatchTaskRequest, TransitionTaskRequest, CreateTaskUpdateRequest } from '@mostly/types';
import * as tasksApi from '@/api/tasks';
import { useConfig } from './use-config';

export function useTaskList(params: Partial<TaskListParams> = {}) {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () => tasksApi.listTasks(params),
    select: (res) => res.data,
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => tasksApi.getTask(id!),
    enabled: !!id,
    select: (res) => res.data,
  });
}

export function useTaskUpdates(taskId: string | null) {
  return useQuery({
    queryKey: ['tasks', taskId, 'updates'],
    queryFn: () => tasksApi.listTaskUpdates(taskId!),
    enabled: !!taskId,
    select: (res) => res.data,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const { config } = useConfig();
  return useMutation({
    mutationFn: (data: Omit<CreateTaskRequest, 'actor_handle'>) =>
      tasksApi.createTask({ ...data, actor_handle: config!.principalHandle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); },
  });
}

export function useEditTask() {
  const qc = useQueryClient();
  const { config } = useConfig();
  return useMutation({
    mutationFn: ({ id, ...data }: Omit<PatchTaskRequest, 'actor_handle'> & { id: string }) =>
      tasksApi.editTask(id, { ...data, actor_handle: config!.principalHandle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); },
  });
}

export function useTransitionTask() {
  const qc = useQueryClient();
  const { config } = useConfig();
  return useMutation({
    mutationFn: ({ id, ...data }: Omit<TransitionTaskRequest, 'actor_handle'> & { id: string }) =>
      tasksApi.transitionTask(id, { ...data, actor_handle: config!.principalHandle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); },
  });
}

export function useClaimTask() {
  const qc = useQueryClient();
  const { config } = useConfig();
  return useMutation({
    mutationFn: ({ id, expected_version }: { id: string; expected_version: number }) =>
      tasksApi.claimTask(id, { expected_version, actor_handle: config!.principalHandle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); },
  });
}

export function useReleaseTask() {
  const qc = useQueryClient();
  const { config } = useConfig();
  return useMutation({
    mutationFn: ({ id, expected_version }: { id: string; expected_version: number }) =>
      tasksApi.releaseTask(id, { expected_version, actor_handle: config!.principalHandle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); },
  });
}

export function useAddTaskUpdate() {
  const qc = useQueryClient();
  const { config } = useConfig();
  return useMutation({
    mutationFn: ({ taskId, ...data }: Omit<CreateTaskUpdateRequest, 'actor_handle'> & { taskId: string }) =>
      tasksApi.addTaskUpdate(taskId, { ...data, actor_handle: config!.principalHandle }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['tasks', vars.taskId, 'updates'] });
    },
  });
}
```

Write to `packages/web/src/hooks/use-tasks.ts`.

- [x] **Step 2: Create project and principal query hooks**

```typescript
import { useQuery } from '@tanstack/react-query';
import * as projectsApi from '@/api/projects';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.listProjects({ limit: 100 }),
    select: (res) => res.data.items,
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectsApi.getProject(id!),
    enabled: !!id,
    select: (res) => res.data,
  });
}
```

Write to `packages/web/src/hooks/use-projects.ts`.

```typescript
import { useQuery } from '@tanstack/react-query';
import * as principalsApi from '@/api/principals';

export function usePrincipals() {
  return useQuery({
    queryKey: ['principals'],
    queryFn: () => principalsApi.listPrincipals({ limit: 100 }),
    select: (res) => res.data.items,
  });
}
```

Write to `packages/web/src/hooks/use-principals.ts`.

- [x] **Step 3: Commit**

```bash
git add packages/web/src/hooks/
git commit -m "feat(web): add TanStack Query hooks for tasks, projects, principals"
```

---

## Task 4: Theme Hook

**Files:**
- Create: `packages/web/src/hooks/use-theme.ts`

- [x] **Step 1: Create theme hook**

```typescript
import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mostly-theme';

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
```

Write to `packages/web/src/hooks/use-theme.ts`.

- [x] **Step 2: Commit**

```bash
git add packages/web/src/hooks/use-theme.ts
git commit -m "feat(web): add theme toggle hook with localStorage persistence"
```

---

## Task 5: Setup Screen

**Files:**
- Create: `packages/web/src/components/setup-screen.tsx`
- Modify: `packages/web/src/App.tsx`

- [x] **Step 1: Create setup screen**

```tsx
import { useState } from 'react';
import { useConfig } from '@/hooks/use-config';
import { setClientConfig, apiFetch } from '@/api/client';

export function SetupScreen() {
  const { setConfig } = useConfig();
  const [serverUrl, setServerUrl] = useState('http://localhost:6080');
  const [token, setToken] = useState('');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      setClientConfig({ baseUrl: serverUrl, token });
      // Validate by fetching the principal
      await apiFetch(`/v0/principals/${encodeURIComponent(handle)}`);
      setConfig({ serverUrl, token, principalHandle: handle });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6"
      >
        <h1 className="text-lg font-bold text-text">Welcome to Mostly</h1>
        <p className="text-sm text-text-secondary">Connect to your Mostly server to get started.</p>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Server URL</span>
          <input
            type="url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">API Token</span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            placeholder="Bearer token"
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Your Handle</span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="mt-1 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            placeholder="e.g. eran"
            required
          />
        </label>

        {error && <p className="text-sm text-status-blocked">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </form>
    </div>
  );
}
```

Write to `packages/web/src/components/setup-screen.tsx`.

- [x] **Step 2: Wire setup screen into App.tsx**

Replace `packages/web/src/App.tsx` with:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { ConfigProvider, useConfig } from '@/hooks/use-config';
import { setClientConfig } from '@/api/client';
import { SetupScreen } from '@/components/setup-screen';
import { useEffect } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

function AppRouter() {
  const { config } = useConfig();

  useEffect(() => {
    if (config) {
      setClientConfig({ baseUrl: config.serverUrl, token: config.token });
    }
  }, [config]);

  if (!config) return <SetupScreen />;

  return (
    <div className="flex h-screen items-center justify-center text-text-secondary">
      Connected as {config.principalHandle}
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
```

Write to `packages/web/src/App.tsx`.

- [x] **Step 3: Verify setup screen renders**

```bash
cd packages/web && pnpm dev &
sleep 3 && curl -s http://localhost:5173 | head -20
kill %1
```

Expected: page loads. Opening in browser shows the setup form.

- [x] **Step 4: Commit**

```bash
git add packages/web/src/components/setup-screen.tsx packages/web/src/App.tsx
git commit -m "feat(web): add setup screen and config-gated app shell"
```

---

## Task 6: Layout Shell + Sidebar

**Files:**
- Create: `packages/web/src/components/layout.tsx`
- Create: `packages/web/src/components/sidebar.tsx`
- Create: `packages/web/src/components/status-icon.tsx`

- [x] **Step 1: Create the status icon component**

```tsx
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
```

Write to `packages/web/src/components/status-icon.tsx`.

- [x] **Step 2: Create the sidebar component**

```tsx
import { NavLink, useLocation } from 'react-router';
import { ListTodo, List, FolderOpen, Users, Settings, Clock, Ban, Search, Plus } from 'lucide-react';
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
  const { theme, toggleTheme } = useTheme();
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
            <kbd className="rounded bg-border/50 px-1 text-[10px] font-mono text-text-muted">⌘K</kbd>
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
```

Write to `packages/web/src/components/sidebar.tsx`.

- [x] **Step 3: Create the layout shell**

```tsx
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
```

Write to `packages/web/src/components/layout.tsx`.

- [x] **Step 4: Commit**

```bash
git add packages/web/src/components/status-icon.tsx packages/web/src/components/sidebar.tsx packages/web/src/components/layout.tsx
git commit -m "feat(web): add layout shell, sidebar, and status icons"
```

---

## Task 7: Task List View

**Files:**
- Create: `packages/web/src/components/task-row.tsx`
- Create: `packages/web/src/components/task-list.tsx`

- [x] **Step 1: Create the task row component**

```tsx
import type { Task } from '@mostly/types';
import { StatusIcon } from './status-icon';
import { cn } from '@/lib/utils';

const TYPE_COLORS: Record<string, string> = {
  feature: 'var(--color-type-feature)',
  bug: 'var(--color-type-bug)',
  chore: 'var(--color-type-chore)',
  research: 'var(--color-type-research)',
  incident: 'var(--color-type-incident)',
  question: 'var(--color-type-question)',
};

interface TaskRowProps {
  task: Task;
  selected: boolean;
  onSelect: (task: Task) => void;
}

export function TaskRow({ task, selected, onSelect }: TaskRowProps) {
  const typeColor = TYPE_COLORS[task.type] ?? 'var(--color-text-muted)';

  return (
    <button
      onClick={() => onSelect(task)}
      className={cn(
        'flex w-full items-center gap-2.5 border-l-2 px-3.5 py-1.5 text-left transition-colors',
        selected
          ? 'border-l-accent bg-accent/[0.06]'
          : 'border-l-transparent hover:bg-border/20',
      )}
    >
      <StatusIcon status={task.status} />
      <span className="min-w-[52px] shrink-0 font-mono text-[11px] text-text-muted">{task.key}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{task.title}</span>
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
        style={{
          backgroundColor: `color-mix(in srgb, ${typeColor} 15%, transparent)`,
          color: typeColor,
        }}
      >
        {task.type}
      </span>
      <span className="min-w-[40px] shrink-0 text-right text-[11px] text-text-muted">
        {task.assignee_id ? '—' : '—'}
      </span>
    </button>
  );
}
```

Write to `packages/web/src/components/task-row.tsx`.

Note: The assignee display will use principal handles once we wire up the principal lookup in Task 9.

- [x] **Step 2: Create the task list with toolbar and grouping**

```tsx
import { useMemo, useState } from 'react';
import type { Task, TaskStatus } from '@mostly/types';
import { TaskRow } from './task-row';
import { StatusIcon } from './status-icon';
import { ChevronDown } from 'lucide-react';

type GroupBy = 'status' | 'type' | 'none';
type SortBy = 'created' | 'updated' | 'key';

interface TaskListProps {
  title: string;
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (task: Task) => void;
}

const STATUS_ORDER: TaskStatus[] = ['in_progress', 'claimed', 'open', 'blocked', 'closed', 'canceled'];

function groupTasks(tasks: Task[], groupBy: GroupBy): Map<string, Task[]> {
  if (groupBy === 'none') return new Map([['all', tasks]]);
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task[groupBy];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(task);
  }
  if (groupBy === 'status') {
    const sorted = new Map<string, Task[]>();
    for (const s of STATUS_ORDER) {
      if (groups.has(s)) sorted.set(s, groups.get(s)!);
    }
    return sorted;
  }
  return groups;
}

export function TaskList({ title, tasks, selectedTaskId, onSelectTask }: TaskListProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [sortBy, setSortBy] = useState<SortBy>('created');

  const sorted = useMemo(() => {
    const copy = [...tasks];
    copy.sort((a, b) => {
      if (sortBy === 'created') return b.created_at.localeCompare(a.created_at);
      if (sortBy === 'updated') return b.updated_at.localeCompare(a.updated_at);
      return a.key.localeCompare(b.key);
    });
    return copy;
  }, [tasks, sortBy]);

  const grouped = useMemo(() => groupTasks(sorted, groupBy), [sorted, groupBy]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <h2 className="text-sm font-bold text-text">{title}</h2>
        <div className="flex items-center gap-2 text-[11px] text-text-secondary">
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="rounded border border-border bg-transparent px-2 py-0.5 text-[11px] focus:outline-none"
          >
            <option value="status">Group: Status</option>
            <option value="type">Group: Type</option>
            <option value="none">No grouping</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded border border-border bg-transparent px-2 py-0.5 text-[11px] focus:outline-none"
          >
            <option value="created">Sort: Newest</option>
            <option value="updated">Sort: Updated</option>
            <option value="key">Sort: Key</option>
          </select>
        </div>
      </div>

      {/* Task rows */}
      <div className="flex-1 overflow-y-auto">
        {Array.from(grouped.entries()).map(([group, groupTasks]) => (
          <div key={group}>
            {groupBy !== 'none' && (
              <div className="flex items-center gap-2 px-3.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {groupBy === 'status' && <StatusIcon status={group as TaskStatus} size={10} />}
                {group.replace('_', ' ')}
                <span className="font-normal opacity-60">{groupTasks.length}</span>
              </div>
            )}
            {groupTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={task.id === selectedTaskId}
                onSelect={onSelectTask}
              />
            ))}
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-text-muted">
            No tasks found
          </div>
        )}
      </div>
    </div>
  );
}
```

Write to `packages/web/src/components/task-list.tsx`.

- [x] **Step 3: Commit**

```bash
git add packages/web/src/components/task-row.tsx packages/web/src/components/task-list.tsx
git commit -m "feat(web): add task list with rows, grouping, and sorting"
```

---

## Task 8: Task Detail Panel

**Files:**
- Create: `packages/web/src/components/task-detail.tsx`
- Create: `packages/web/src/components/updates-timeline.tsx`

- [x] **Step 1: Create the updates timeline**

```tsx
import type { TaskUpdate, Principal } from '@mostly/types';
import { cn } from '@/lib/utils';

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
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-border/50 text-[9px] text-text-muted">⚙</div>
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
```

Write to `packages/web/src/components/updates-timeline.tsx`.

- [x] **Step 2: Create the task detail panel**

```tsx
import { useState } from 'react';
import type { Task, TaskStatus, Principal } from '@mostly/types';
import { X, MoreHorizontal } from 'lucide-react';
import { StatusIcon } from './status-icon';
import { UpdatesTimeline } from './updates-timeline';
import { useTaskUpdates, useTransitionTask, useClaimTask, useReleaseTask, useAddTaskUpdate, useEditTask } from '@/hooks/use-tasks';
import { usePrincipals } from '@/hooks/use-principals';
import { RESOLUTION_FOR_STATUS } from '@mostly/types';
import { cn } from '@/lib/utils';

const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  open: ['claimed', 'closed', 'canceled'],
  claimed: ['in_progress', 'blocked', 'open', 'closed', 'canceled'],
  in_progress: ['blocked', 'open', 'closed', 'canceled'],
  blocked: ['claimed', 'in_progress', 'open', 'closed', 'canceled'],
};

const TYPE_COLORS: Record<string, string> = {
  feature: 'var(--color-type-feature)',
  bug: 'var(--color-type-bug)',
  chore: 'var(--color-type-chore)',
  research: 'var(--color-type-research)',
  incident: 'var(--color-type-incident)',
  question: 'var(--color-type-question)',
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
      resolution: isTerminal && resolution ? resolution as any : undefined,
      expected_version: task.version,
    }, {
      onSuccess: () => { setShowTransition(false); setTransitionTo(''); setResolution(''); },
    });
  }

  function handleAddUpdate() {
    if (!updateBody.trim()) return;
    addUpdateMutation.mutate({
      taskId: task.id,
      kind: updateKind as any,
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
        <span className="text-text">{assignee?.handle ?? '—'}</span>

        <span className="text-text-muted">Claimed by</span>
        <div className="flex items-center gap-1.5">
          <span className="text-text">{claimer?.handle ?? '—'}</span>
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
          Transition →
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
        <div className="border-b border-border px-4 py-3 space-y-2">
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
        <div className="border-b border-border px-4 py-3 space-y-2">
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
```

Write to `packages/web/src/components/task-detail.tsx`.

- [x] **Step 3: Commit**

```bash
git add packages/web/src/components/task-detail.tsx packages/web/src/components/updates-timeline.tsx
git commit -m "feat(web): add task detail panel with properties, transitions, and updates timeline"
```

---

## Task 9: Create Task Form

**Files:**
- Create: `packages/web/src/components/task-form.tsx`

- [x] **Step 1: Create the task creation form**

```tsx
import { useState } from 'react';
import { X } from 'lucide-react';
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
  const [type, setType] = useState<string>('feature');
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [description, setDescription] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    createMutation.mutate({
      title: title.trim(),
      type: type as any,
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
          <button type="button" onClick={onClose}>
            <X size={16} className="text-text-muted hover:text-text" />
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
            onChange={(e) => setType(e.target.value)}
            className="flex-1 rounded border border-border bg-bg px-2 py-1.5 text-[12px] text-text focus:outline-none"
          >
            {['feature', 'bug', 'chore', 'research', 'incident', 'question'].map((t) => (
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
```

Write to `packages/web/src/components/task-form.tsx`.

- [x] **Step 2: Commit**

```bash
git add packages/web/src/components/task-form.tsx
git commit -m "feat(web): add task creation form dialog"
```

---

## Task 10: Command Palette

**Files:**
- Create: `packages/web/src/components/command-palette.tsx`

- [x] **Step 1: Create command palette**

```tsx
import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router';
import { useTaskList } from '@/hooks/use-tasks';
import { useProjects } from '@/hooks/use-projects';
import { useTheme } from '@/hooks/use-theme';
import { StatusIcon } from './status-icon';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onCreateTask: () => void;
}

export function CommandPalette({ open, onClose, onCreateTask }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { data: tasksData } = useTaskList({ limit: 50 });
  const { data: projects } = useProjects();
  const { toggleTheme } = useTheme();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  if (!open) return null;

  const tasks = tasksData?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">
        <Command
          className="overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
          shouldFilter={true}
        >
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Search tasks, projects, or actions..."
            className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-text-muted">
              No results found.
            </Command.Empty>

            <Command.Group heading="Actions" className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              <Command.Item
                onSelect={() => { onClose(); onCreateTask(); }}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-text data-[selected]:bg-accent/10"
              >
                Create task
              </Command.Item>
              <Command.Item
                onSelect={() => { onClose(); toggleTheme(); }}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-text data-[selected]:bg-accent/10"
              >
                Toggle theme
              </Command.Item>
            </Command.Group>

            {tasks.length > 0 && (
              <Command.Group heading="Tasks" className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {tasks.slice(0, 10).map((task) => (
                  <Command.Item
                    key={task.id}
                    value={`${task.key} ${task.title}`}
                    onSelect={() => { onClose(); navigate(`/tasks/all/${task.id}`); }}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-text data-[selected]:bg-accent/10"
                  >
                    <StatusIcon status={task.status} size={12} />
                    <span className="font-mono text-[10px] text-text-muted">{task.key}</span>
                    <span className="truncate">{task.title}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {projects && projects.length > 0 && (
              <Command.Group heading="Projects" className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {projects.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`${p.key} ${p.name}`}
                    onSelect={() => { onClose(); navigate(`/projects/${p.key}`); }}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-text data-[selected]:bg-accent/10"
                  >
                    {p.key} — {p.name}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
```

Write to `packages/web/src/components/command-palette.tsx`.

- [x] **Step 2: Commit**

```bash
git add packages/web/src/components/command-palette.tsx
git commit -m "feat(web): add command palette with task/project search and actions"
```

---

## Task 11: Keyboard Shortcuts

**Files:**
- Create: `packages/web/src/hooks/use-keyboard.ts`

- [x] **Step 1: Create keyboard shortcut hook**

```typescript
import { useEffect, useCallback } from 'react';

type ShortcutHandler = () => void;

interface Shortcuts {
  [key: string]: ShortcutHandler;
}

export function useKeyboard(shortcuts: Shortcuts) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't fire shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
      // Exception: Escape always fires
      if (e.key !== 'Escape') return;
    }

    // Cmd+K / Ctrl+K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      shortcuts['cmd+k']?.();
      return;
    }

    // Single-key shortcuts
    const handler = shortcuts[e.key.toLowerCase()];
    if (handler && !e.metaKey && !e.ctrlKey && !e.altKey) {
      handler();
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
```

Write to `packages/web/src/hooks/use-keyboard.ts`.

- [x] **Step 2: Commit**

```bash
git add packages/web/src/hooks/use-keyboard.ts
git commit -m "feat(web): add keyboard shortcut hook"
```

---

## Task 12: Pages + Router Wiring

**Files:**
- Create: `packages/web/src/pages/tasks.tsx`
- Create: `packages/web/src/pages/project-tasks.tsx`
- Modify: `packages/web/src/App.tsx`

- [x] **Step 1: Create the tasks page**

This page handles `/tasks/my`, `/tasks/all`, `/views/blocked`, and `/views/claims`.

```tsx
import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useTaskList } from '@/hooks/use-tasks';
import { useTask } from '@/hooks/use-tasks';
import { useConfig } from '@/hooks/use-config';
import { TaskList } from '@/components/task-list';
import { TaskDetail } from '@/components/task-detail';
import { Layout } from '@/components/layout';
import { TaskForm } from '@/components/task-form';
import { CommandPalette } from '@/components/command-palette';
import { useKeyboard } from '@/hooks/use-keyboard';
import type { Task, TaskListParams } from '@mostly/types';

export function TasksPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { config } = useConfig();

  const [cmdOpen, setCmdOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Determine which view we're in
  const basePath = location.pathname.split('/').slice(0, 3).join('/');
  let title = 'All Tasks';
  let filters: Partial<TaskListParams> = {};

  if (basePath === '/tasks/my') {
    title = 'My Tasks';
    // We need the principal ID; for now filter by assignee handle won't work directly.
    // The API filters by assignee_id, so we'll pass it once we have it.
  } else if (basePath === '/views/blocked') {
    title = 'Blocked';
    filters = { status: 'blocked' };
  } else if (basePath === '/views/claims') {
    title = 'Active Claims';
    // Filter for tasks with active claims — the API doesn't have a direct filter,
    // so we show claimed + in_progress tasks as a proxy
    filters = { status: 'claimed' };
  }

  const { data: tasksData, isLoading } = useTaskList(filters);
  const { data: selectedTask } = useTask(taskId ?? null);

  const tasks = tasksData?.items ?? [];

  const handleSelectTask = useCallback((task: Task) => {
    const pathPrefix = basePath.startsWith('/views') ? basePath : basePath;
    navigate(`${pathPrefix}/${task.id}`);
  }, [navigate, basePath]);

  const handleCloseDetail = useCallback(() => {
    navigate(basePath);
  }, [navigate, basePath]);

  useKeyboard(useMemo(() => ({
    'cmd+k': () => setCmdOpen(true),
    'Escape': () => { setCmdOpen(false); setFormOpen(false); if (taskId) handleCloseDetail(); },
    'c': () => setFormOpen(true),
  }), [taskId, handleCloseDetail]));

  return (
    <>
      <Layout
        onCommandPalette={() => setCmdOpen(true)}
        detail={selectedTask ? <TaskDetail task={selectedTask} onClose={handleCloseDetail} /> : undefined}
      >
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-text-muted">Loading...</div>
        ) : (
          <TaskList
            title={title}
            tasks={tasks}
            selectedTaskId={taskId ?? null}
            onSelectTask={handleSelectTask}
          />
        )}
      </Layout>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onCreateTask={() => setFormOpen(true)} />
      {formOpen && <TaskForm onClose={() => setFormOpen(false)} />}
    </>
  );
}
```

Write to `packages/web/src/pages/tasks.tsx`.

- [x] **Step 2: Create the project tasks page**

```tsx
import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTaskList, useTask } from '@/hooks/use-tasks';
import { useProject } from '@/hooks/use-projects';
import { TaskList } from '@/components/task-list';
import { TaskDetail } from '@/components/task-detail';
import { Layout } from '@/components/layout';
import { TaskForm } from '@/components/task-form';
import { CommandPalette } from '@/components/command-palette';
import { useKeyboard } from '@/hooks/use-keyboard';
import type { Task } from '@mostly/types';

export function ProjectTasksPage() {
  const { projectKey, taskId } = useParams();
  const navigate = useNavigate();

  const [cmdOpen, setCmdOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const { data: project } = useProject(projectKey ?? null);
  const { data: tasksData, isLoading } = useTaskList(
    project ? { project_id: project.id } : {},
  );
  const { data: selectedTask } = useTask(taskId ?? null);

  const tasks = tasksData?.items ?? [];
  const basePath = `/projects/${projectKey}`;

  const handleSelectTask = useCallback((task: Task) => {
    navigate(`${basePath}/${task.id}`);
  }, [navigate, basePath]);

  const handleCloseDetail = useCallback(() => {
    navigate(basePath);
  }, [navigate, basePath]);

  useKeyboard(useMemo(() => ({
    'cmd+k': () => setCmdOpen(true),
    'Escape': () => { setCmdOpen(false); setFormOpen(false); if (taskId) handleCloseDetail(); },
    'c': () => setFormOpen(true),
  }), [taskId, handleCloseDetail]));

  return (
    <>
      <Layout
        onCommandPalette={() => setCmdOpen(true)}
        detail={selectedTask ? <TaskDetail task={selectedTask} onClose={handleCloseDetail} /> : undefined}
      >
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-text-muted">Loading...</div>
        ) : (
          <TaskList
            title={project?.name ?? projectKey ?? 'Project'}
            tasks={tasks}
            selectedTaskId={taskId ?? null}
            onSelectTask={handleSelectTask}
          />
        )}
      </Layout>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onCreateTask={() => setFormOpen(true)} />
      {formOpen && <TaskForm onClose={() => setFormOpen(false)} defaultProjectId={project?.id} />}
    </>
  );
}
```

Write to `packages/web/src/pages/project-tasks.tsx`.

- [x] **Step 3: Wire routes into App.tsx**

Replace `packages/web/src/App.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { ConfigProvider, useConfig } from '@/hooks/use-config';
import { setClientConfig } from '@/api/client';
import { SetupScreen } from '@/components/setup-screen';
import { TasksPage } from '@/pages/tasks';
import { ProjectTasksPage } from '@/pages/project-tasks';
import { useEffect } from 'react';
import { useTheme } from '@/hooks/use-theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

function AppRouter() {
  const { config } = useConfig();
  useTheme(); // Apply theme on mount

  useEffect(() => {
    if (config) {
      setClientConfig({ baseUrl: config.serverUrl, token: config.token });
    }
  }, [config]);

  if (!config) return <SetupScreen />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/tasks/my" replace />} />
      <Route path="/tasks/my" element={<TasksPage />} />
      <Route path="/tasks/my/:taskId" element={<TasksPage />} />
      <Route path="/tasks/all" element={<TasksPage />} />
      <Route path="/tasks/all/:taskId" element={<TasksPage />} />
      <Route path="/projects/:projectKey" element={<ProjectTasksPage />} />
      <Route path="/projects/:projectKey/:taskId" element={<ProjectTasksPage />} />
      <Route path="/views/blocked" element={<TasksPage />} />
      <Route path="/views/blocked/:taskId" element={<TasksPage />} />
      <Route path="/views/claims" element={<TasksPage />} />
      <Route path="/views/claims/:taskId" element={<TasksPage />} />
      <Route path="*" element={<Navigate to="/tasks/my" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
```

Write to `packages/web/src/App.tsx`.

- [x] **Step 4: Verify the app builds**

```bash
cd packages/web && pnpm build
```

Expected: Successful build with no TypeScript errors.

- [x] **Step 5: Commit**

```bash
git add packages/web/src/pages/ packages/web/src/App.tsx
git commit -m "feat(web): add pages, routing, and wire everything together"
```

---

## Task 13: Responsive Layout

**Files:**
- Modify: `packages/web/src/components/layout.tsx`
- Modify: `packages/web/src/components/sidebar.tsx`

- [x] **Step 1: Update layout for responsive breakpoints**

Replace `packages/web/src/components/layout.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { Sidebar } from './sidebar';

interface LayoutProps {
  children: React.ReactNode;
  detail?: React.ReactNode;
  onCommandPalette: () => void;
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

export function Layout({ children, detail, onCommandPalette }: LayoutProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const bp = useBreakpoint();

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
          <button onClick={() => setMobileMenuOpen(true)} className="text-text-secondary text-lg">☰</button>
          <span className="text-sm font-bold text-text">Mostly</span>
          <button onClick={onCommandPalette} className="text-text-secondary text-lg">⌘</button>
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
          <div className="w-[380px] shrink-0 overflow-y-auto border-l border-border bg-surface">
            {detail}
          </div>
        )}
      </main>
    </div>
  );
}
```

Write to `packages/web/src/components/layout.tsx`.

- [x] **Step 2: Verify build**

```bash
cd packages/web && pnpm build
```

Expected: Successful build.

- [x] **Step 3: Commit**

```bash
git add packages/web/src/components/layout.tsx
git commit -m "feat(web): add responsive layout with mobile/tablet/desktop breakpoints"
```

---

## Task 14: Final Integration Verification

- [x] **Step 1: Run type check**

```bash
cd packages/web && npx tsc --noEmit
```

Expected: No TypeScript errors.

- [x] **Step 2: Run production build**

```bash
cd packages/web && pnpm build
```

Expected: Successful Vite build, output in `dist/`.

- [x] **Step 3: Verify dev server starts and proxies API**

```bash
cd packages/web && pnpm dev &
sleep 3 && curl -s http://localhost:5173 | grep -c "root"
kill %1
```

Expected: Output `1` (the root div is present).

- [x] **Step 4: Add .superpowers/ to .gitignore if not present**

Check if `.superpowers/` is in `.gitignore`. If not, add it:

```bash
grep -q '.superpowers/' .gitignore || echo '.superpowers/' >> .gitignore
```

- [x] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat(web): complete v1 frontend with all core features"
```
