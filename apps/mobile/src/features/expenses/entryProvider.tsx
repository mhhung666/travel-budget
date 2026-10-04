import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/features/auth/AuthProvider';
import { openPendingExpenseStore } from '@/storage/pendingExpenseDatabase';
import type { PendingScope } from '@/storage/pendingExpenses';
import { ExpenseEntry } from './entry';
import { pendingKey, refreshTripData } from './entryQueries';

const EntryContext = createContext<ExpenseEntry | null>(null);

/**
 * The one entry engine of the app. It outlives every screen: a request that was sent when a screen
 * closed is still settled, saved or kept, and the lists it changed are refreshed.
 */
export function ExpenseEntryProvider({ children }: PropsWithChildren) {
  const client = useQueryClient();
  const { manager } = useAuth();
  const [entry] = useState(
    () =>
      new ExpenseEntry({
        store: openPendingExpenseStore,
        request: (userId, path, schema, options) =>
          manager.requestAs(userId, path, schema, options),
        newId: () => Crypto.randomUUID(),
        onCommitted: (scope, tripId) =>
          refreshTripData(client, scope.environment, scope.accountId, tripId),
        onChange: (scope, tripId) =>
          void client.invalidateQueries({
            queryKey: pendingKey(scope.environment, scope.accountId, tripId),
          }),
      })
  );
  return <EntryContext.Provider value={entry}>{children}</EntryContext.Provider>;
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
 * to the foreground or regains connectivity. It only looks; nothing is sent again without the user.
 */
export function usePendingRecovery() {
  const { entry, scope } = useExpenseEntry();
  useEffect(() => {
    if (!scope) return;
    const run = () => {
      if (onlineManager.isOnline()) void entry.recover(scope);
    };
    run();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    const connectivity = onlineManager.subscribe((online) => {
      if (online) run();
    });
    return () => {
      foreground.remove();
      connectivity();
    };
  }, [entry, scope]);
}
