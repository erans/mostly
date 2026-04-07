import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router';
import { setBaseUrl } from '@/api/client';
import { ConfigProvider, useConfig } from '@/hooks/use-config';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { SetupScreen } from '@/components/setup-screen';
import { TasksPage } from '@/pages/tasks';
import { ProjectTasksPage } from '@/pages/project-tasks';
import { LoginPage } from '@/pages/login';
import { RegisterPage } from '@/pages/register';
import { AcceptInvitePage } from '@/pages/accept-invite';
import { ApiKeysPage } from '@/pages/api-keys';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

/**
 * Layout route guard for authenticated areas of the app.
 *
 * Three states:
 *  - bootstrapping: render a neutral loading placeholder so we don't flash
 *    the login page (or, worse, the protected page) before `getMe` settles.
 *  - signed out (user === null): redirect to /login with `replace` so the
 *    unauthenticated URL doesn't pollute browser history.
 *  - signed in: render <Outlet /> so nested routes mount.
 *
 * TODO(task-16-followup): support a `?redirect=` query param so users land
 * back on the page they tried to visit after signing in. Out of scope for
 * Task 16a.
 */
function RequireAuth() {
  const { user, bootstrapping } = useAuth();

  if (bootstrapping) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (user === null) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function AppRouter() {
  const { config } = useConfig();
  useTheme(); // Apply theme on mount

  // SetupScreen is intentionally outside AuthProvider: you can't authenticate
  // before you know which server to hit.
  if (!config) return <SetupScreen />;

  // CRITICAL ORDERING: setBaseUrl MUST run before AuthProvider mounts.
  // AuthProvider's bootstrap effect calls getMe() which calls apiFetch()
  // which calls getBaseUrl() and throws if no base URL is set. The
  // bootstrap swallows that throw (it can't tell "misconfigured" from
  // "401 not logged in"), so a missing setBaseUrl silently strands the
  // user on /login with no diagnostic.
  //
  // Idempotent — called on every render so AuthProvider's bootstrap effect
  // always sees a configured base URL. Safe as a render-time side effect
  // because it just writes a module-level variable.
  setBaseUrl(config.serverUrl);

  return (
    <AuthProvider>
      <Routes>
        {/* Public routes — no auth required. */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />

        {/* Protected routes — RequireAuth is a layout route so the catch-all
            below is also gated, preventing unauth users from briefly seeing
            the tasks page after hitting an unknown URL. */}
        <Route element={<RequireAuth />}>
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
          <Route path="/settings/api-keys" element={<ApiKeysPage />} />
          <Route path="*" element={<Navigate to="/tasks/my" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
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
