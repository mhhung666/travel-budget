'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { Persister } from '@tanstack/react-query-persist-client';
import {
  createQueryPersister,
  PERSIST_BUSTER,
  PERSIST_MAX_AGE,
  removeLegacyQueryCache,
} from '@/lib/queryPersister';
import { registerOfflineMutationDefaults } from '@/lib/offlineMutations';
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
  await queryClient.cancelQueries();
  queryClient.clear();
  clearTripAccessModes();
  await persister.removeClient();
}

function shouldPersistQuery(query: { queryKey: readonly unknown[]; state: { status: string } }) {
  const rootKey = query.queryKey[0];
  const excludedRoots = new Set(['currentUser', 'notifications', 'mapPhotos']);
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
 * is `offlineFirst` so that when the device is offline queries serve the
 * persisted cache instead of erroring or spinning on retries.
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
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          gcTime: 5 * 60_000,
          retry: 1,
          refetchOnWindowFocus: false,
          networkMode: 'offlineFirst',
        },
      },
    });
    // Re-supply the create-expense mutationFn so paused mutations restored from
    // IndexedDB after a reload can be resumed (ROADMAP #5 Phase 2).
    registerOfflineMutationDefaults(client);
    return client;
  });

  const [persister] = useState(() => createQueryPersister(cacheScope));

  useEffect(() => {
    void removeLegacyQueryCache();
  }, []);

  const hasPausedMutations = useCallback(
    () =>
      queryClient
        .getMutationCache()
        .getAll()
        .some((mutation) => mutation.state.isPaused),
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
            dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
          }}
          // After the persisted cache + paused mutations are restored, replay any
          // queued offline writes. If still offline they stay paused and TanStack
          // auto-resumes them on reconnect.
          onSuccess={() => {
            queryClient.resumePausedMutations();
          }}
        >
          {children}
        </PersistQueryClientProvider>
      </QueryPersistenceContext.Provider>
    </AuthStateContext.Provider>
  );
}
