'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Client-side TanStack Query provider.
 *
 * One QueryClient per browser session (created lazily in state so it survives
 * re-renders but is never shared across requests on the server). Defaults are
 * tuned for this app: data is considered fresh for 30s (cuts redundant refetches
 * while navigating between trip tabs), and failed queries retry once.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
