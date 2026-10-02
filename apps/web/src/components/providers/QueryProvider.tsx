'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { Persister } from '@tanstack/react-query-persist-client';
import {
  createQueryPersister,
  PERSIST_BUSTER,
  PERSIST_MAX_AGE,
  removeLegacyQueryCache,
} from '@/lib/queryPersister';
import { expenseCreateMutationKey, registerOfflineMutationDefaults } from '@/lib/offlineMutations';
import { bindExpenseOutbox, clearExpenseOutbox, expenseOutboxQueryKey } from '@/lib/expenseOutbox';
import { clearTripAccessModes } from '@/hooks/queries/fetcher';

interface QueryPersistenceControls {
  hasPausedMutations: () => boolean;
  clearForLogout: () => Promise<void>;
}

const AuthStateContext = createContext(false);

/** Server-resolved login state, so public pages do not probe an authenticated action first. */
export function useAuthenticatedSession(): boolean {
  return useContext(AuthStateContext);
}

const QueryPersistenceContext = createContext<QueryPersistenceControls | null>(null);

export function useQueryPersistenceControls(): QueryPersistenceControls {
  const value = useContext(QueryPersistenceContext);
  if (!value) throw new Error('useQueryPersistenceControls must be used inside QueryProvider');
  return value;
}

export async function clearQueryState(
  queryClient: QueryClient,
  persister: Persister
): Promise<void> {
  if ('stop' in persister && typeof persister.stop === 'function') persister.stop();
  await queryClient.cancelQueries();
  queryClient.clear();
  await clearExpenseOutbox(queryClient);
  clearTripAccessModes();
  await persister.removeClient();
}

function shouldPersistQuery(query: { queryKey: readonly unknown[]; state: { status: string } }) {
  const rootKey = query.queryKey[0];
  const excludedRoots = new Set(['expenseOutbox', 'notifications', 'mapPhotos']);
  const isPhotoQuery = rootKey === 'trip' && query.queryKey[2] === 'photos';
  return !excludedRoots.has(String(rootKey)) && !isPhotoQuery && query.state.status === 'success';
}

/**
 * Client-side TanStack Query provider with offline persistence (ROADMAP #5).
 *
 * One QueryClient per browser session (created lazily in state so it survives
 * re-renders but is never shared across requests on the server). Defaults are
 * tuned for this app: data is fresh for 30s (cuts redundant refetches while
 * navigating between trip tabs), failed queries retry once, and `networkMode`
 * is `online` so offline reads use persisted data without attempting a server
 * action; missing data stays paused until a connection is available.
 *
 * {@link PersistQueryClientProvider} dehydrates the cache to IndexedDB (see
 * {@link createQueryPersister}) and rehydrates it on load, so previously-viewed
 * trips render with no network.
 */
export function QueryProvider({
  cacheScope,
  authenticated,
  children,
}: {
  cacheScope: string;
  authenticated: boolean;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => {
    // TanStack starts online and only listens for subsequent browser events.
    // Seed it before children mount or persisted mutations are restored: an
    // offline reload otherwise attempts a write and discards the failed queue.
    if (typeof window !== 'undefined') {
      onlineManager.setOnline(window.navigator.onLine);
    }
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          gcTime: 5 * 60_000,
          retry: 1,
          refetchOnWindowFocus: false,
          networkMode: 'online',
        },
      },
    });
    // Re-supply the create-expense mutationFn so paused mutations restored from
    // IndexedDB after a reload can be resumed (ROADMAP #5 Phase 2).
    registerOfflineMutationDefaults(client);
    return client;
  });

  const [outbox] = useState(() => bindExpenseOutbox(queryClient, cacheScope));
  const [persister] = useState(() => createQueryPersister(cacheScope));

  useEffect(() => {
    void removeLegacyQueryCache();
  }, []);

  const hasPausedMutations = useCallback(
    () =>
      Object.values(
        queryClient.getQueryData<Record<string, { status: string }>>(expenseOutboxQueryKey) ?? {}
      ).some((entry) => entry.status !== 'done') ||
      queryClient
        .getMutationCache()
        .getAll()
        .some(
          (mutation) =>
            mutation.state.isPaused ||
            (mutation.options.mutationKey?.[0] === expenseCreateMutationKey[0] &&
              mutation.options.mutationKey?.[1] === expenseCreateMutationKey[1] &&
              mutation.state.status === 'pending')
        ),
    [queryClient]
  );
  const clearForLogout = useCallback(
    () => clearQueryState(queryClient, persister),
    [persister, queryClient]
  );
  const controls = useMemo(
    () => ({ hasPausedMutations, clearForLogout }),
    [clearForLogout, hasPausedMutations]
  );

  return (
    <AuthStateContext.Provider value={authenticated}>
      <QueryPersistenceContext.Provider value={controls}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: PERSIST_MAX_AGE,
            buster: PERSIST_BUSTER,
            dehydrateOptions: {
              shouldDehydrateQuery: shouldPersistQuery,
              shouldDehydrateMutation: (mutation) =>
                mutation.options.mutationKey?.[0] === expenseCreateMutationKey[0] &&
                mutation.options.mutationKey?.[1] === expenseCreateMutationKey[1]
                  ? mutation.state.status === 'pending' && !!mutation.state.context
                  : mutation.state.isPaused,
            },
          }}
          // After the persisted cache + paused mutations are restored, replay any
          // queued offline writes. If still offline they stay paused and TanStack
          // auto-resumes them on reconnect.
          onSuccess={async () => {
            queryClient.setQueryData(expenseOutboxQueryKey, await outbox.read());
            void queryClient.resumePausedMutations();
          }}
        >
          {children}
        </PersistQueryClientProvider>
      </QueryPersistenceContext.Provider>
    </AuthStateContext.Provider>
  );
}
