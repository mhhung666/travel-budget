import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { ApiError } from '@/api/client';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { useAuth } from '@/features/auth/AuthProvider';
import { ExpenseQueue } from '@/features/expenseQueue/sync';
import { openExpenseQueueStore, openPendingExpenseStore } from '@/storage/pendingExpenseDatabase';
import type { PendingScope } from '@/storage/pendingExpenses';
import { ExpenseEntry } from './entry';
import type { EntryRequest } from './entry';
import { pendingKey, refreshTripData } from './entryQueries';

const QueueContext = createContext<ExpenseQueue | null>(null);
export const queueKey = (scope: PendingScope | null) =>
  [scope?.environment, scope?.accountId, 'expense-queue'] as const;
const EntryContext = createContext<ExpenseEntry | null>(null);

/**
 * The one entry engine of the app. It outlives every screen: a request that was sent when a screen
 * closed is still settled, saved or kept, and the lists it changed are refreshed.
 */
export function ExpenseEntryProvider({ children }: PropsWithChildren) {
  const client = useQueryClient();
  const { manager } = useAuth();
  const { catalog } = useDraftCatalog();
  const [request] = useState(() => {
    const send: EntryRequest = async (userId, path, schema, options) => {
      try {
        if (AppState.currentState !== 'active' || !onlineManager.isOnline())
          throw new ApiError('CANCELLED');
        const scope = { environment: manager.api.baseUrl, accountId: userId };
        const version = manager.getSignInVersion();
        const captured = catalog.captureAccess(scope);
        const trip = /^\/trips\/([^/]+)\//.exec(path)?.[1];
        return await manager.requestAs(userId, path, schema, {
          ...options,
          beforeSend: () => {
            options?.beforeSend?.();
            if (
              AppState.currentState !== 'active' ||
              !onlineManager.isOnline() ||
              version !== manager.getSignInVersion()
            )
              throw new ApiError('CANCELLED');
            captured(trip);
            if (trip && options?.method === 'POST' && !catalog.isVisible(scope, trip))
              throw new ApiError('ACCESS_REVOKED', 403);
          },
        });
      } catch (error) {
        const match = /^\/trips\/([^/]+)\//.exec(path);
        if (
          match &&
          error instanceof ApiError &&
          error.source === 'request' &&
          [403, 404].includes(error.status)
        )
          await catalog
            .deny(
              { environment: manager.api.baseUrl, accountId: userId },
              decodeURIComponent(match[1])
            )
            .catch(() => undefined);
        throw error;
      }
    };
    return send;
  });
  const [entry] = useState(
    () =>
      new ExpenseEntry({
        store: openPendingExpenseStore,
        request,
        newId: () => Crypto.randomUUID(),
        onCommitted: (scope, tripId) =>
          refreshTripData(client, scope.environment, scope.accountId, tripId),
        onChange: (scope, tripId) => {
          void client.invalidateQueries({
            queryKey: pendingKey(scope.environment, scope.accountId, tripId),
          });
          void client.invalidateQueries({ queryKey: queueKey(scope) });
        },
      })
  );
  const [queue] = useState(
    () =>
      new ExpenseQueue({
        store: openExpenseQueueStore,
        entry,
        request,
        authorizationVersion: (scope, tripId) => catalog.accessVersion(scope, tripId),
        newId: () => Crypto.randomUUID(),
        active: (scope) =>
          AppState.currentState === 'active' &&
          onlineManager.isOnline() &&
          manager.getSnapshot().status === 'signedIn' &&
          manager.getSnapshot().user?.id === scope.accountId &&
          manager.api.baseUrl === scope.environment,
        onChange: (scope) => {
          void client.invalidateQueries({ queryKey: queueKey(scope) });
        },
      })
  );
  return (
    <EntryContext.Provider value={entry}>
      <QueueContext.Provider value={queue}>
        <ExpenseSync />
        {children}
      </QueueContext.Provider>
    </EntryContext.Provider>
  );
}

/** The engine and the signed-in account's scope (null while signed out). */
export function useExpenseEntry() {
  const entry = useContext(EntryContext);
  const { manager, user } = useAuth();
  if (!entry) throw new Error('ExpenseEntryProvider is missing');
  const environment = manager.api.baseUrl;
  const accountId = user?.id;
  const scope = useMemo<PendingScope | null>(
    () => (accountId ? { environment, accountId } : null),
    [environment, accountId]
  );
  return { entry, scope, manager };
}

/** Unconfirmed requests of this trip for the signed-in account. */
export function usePendingExpenses(tripId: string) {
  const { entry, scope } = useExpenseEntry();
  return useQuery({
    queryKey: pendingKey(scope?.environment, scope?.accountId, tripId),
    enabled: !!scope,
    // A local read must not wait for connectivity, and must reflect the database every time.
    networkMode: 'always',
    staleTime: 0,
    queryFn: () => entry.list(scope!, tripId),
  });
}

/**
 * Asks the server about the signed-in account's unconfirmed requests when the app starts, returns
 * to the foreground or regains connectivity. Confirmed queue items may send; legacy C only looks.
 */
export function usePendingRecovery() {
  const { entry, scope } = useExpenseEntry();
  const { status } = useAuth();
  const { queue } = useExpenseQueue();
  useEffect(() => {
    if (!scope || status !== 'signedIn') return;
    let running = false;
    const run = () => {
      if (running || AppState.currentState !== 'active' || !onlineManager.isOnline()) return;
      running = true;
      void queue
        .synchronize(scope)
        .then(() => entry.recover(scope))
        .catch(() => undefined)
        .finally(() => {
          running = false;
        });
    };
    const timer = setInterval(run, 30_000);
    run();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    const connectivity = onlineManager.subscribe((online) => {
      if (online) run();
    });
    return () => {
      clearInterval(timer);
      foreground.remove();
      connectivity();
    };
  }, [entry, queue, scope, status]);
}

export function useExpenseQueue() {
  const queue = useContext(QueueContext);
  const { scope } = useExpenseEntry();
  if (!queue) throw new Error('ExpenseEntryProvider is missing');
  const sync = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const records = useQuery({
    queryKey: queueKey(scope),
    enabled: !!scope,
    networkMode: 'always',
    staleTime: 0,
    queryFn: () => queue.list(scope!),
  });
  return {
    queue,
    scope,
    records,
    syncFailed:
      !!scope && sync.failedScopes.includes(JSON.stringify([scope.environment, scope.accountId])),
  };
}

function ExpenseSync() {
  usePendingRecovery();
  return null;
}
