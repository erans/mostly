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
