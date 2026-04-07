import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { ConfigProvider, useConfig } from '@/hooks/use-config';
import { setBaseUrl } from '@/api/client';
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
      setBaseUrl(config.serverUrl);
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
