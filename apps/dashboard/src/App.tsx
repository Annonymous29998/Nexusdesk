import { type ReactNode, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@nexusdesk/ui';
import { AppRoutes } from '@/routes';
import { useAuthStore } from '@/stores/auth';
import { applyTheme, useThemeStore } from '@/stores/theme';
import { ensureApiMode } from '@/api/client';
import { MinimizedViewerDock } from '@/components/viewer/MinimizedViewerDock';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Bootstrap({ children }: { children: ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    void ensureApiMode().finally(() => {
      void hydrate();
    });
  }, [hydrate]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (useThemeStore.getState().theme === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Bootstrap>
            <AppRoutes />
            <MinimizedViewerDock />
          </Bootstrap>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
