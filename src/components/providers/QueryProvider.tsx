'use client';

import { useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createQueryPersister, PERSIST_BUSTER, PERSIST_MAX_AGE } from '@/lib/queryPersister';

/**
 * Client-side TanStack Query provider with offline persistence (ROADMAP #5).
 *
 * One QueryClient per browser session (created lazily in state so it survives
 * re-renders but is never shared across requests on the server). Defaults are
 * tuned for this app: data is fresh for 30s (cuts redundant refetches while
 * navigating between trip tabs), failed queries retry once, and `networkMode`
 * is `offlineFirst` so that when the device is offline queries serve the
 * persisted cache instead of erroring or spinning on retries.
 *
 * {@link PersistQueryClientProvider} dehydrates the cache to IndexedDB (see
 * {@link createQueryPersister}) and rehydrates it on load, so previously-viewed
 * trips render with no network.
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
            networkMode: 'offlineFirst',
          },
        },
      })
  );

  const [persister] = useState(() => createQueryPersister());

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: PERSIST_MAX_AGE, buster: PERSIST_BUSTER }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
