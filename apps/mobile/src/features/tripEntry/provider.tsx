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
import { ApiError } from '@/api/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import type { PendingScope } from '@/storage/pendingExpenses';
import { TripEntry } from './engine';
import { refreshTripData } from '@/features/expenses/entryQueries';
import { useDraftCatalog } from '@/features/localDrafts/provider';
const Context = createContext<TripEntry | null>(null);
const keyOf = (scope: PendingScope | null) => [scope?.environment, scope?.accountId, 'mutations'];
export function TripEntryProvider({ children }: PropsWithChildren) {
  const { manager } = useAuth();
  const client = useQueryClient();
  const { catalog } = useDraftCatalog();
  const [entry] = useState(
    () =>
      new TripEntry({
        store: openMutationStore,
        newId: () => Crypto.randomUUID(),
        active: (scope) =>
          manager.api.baseUrl === scope.environment &&
          manager.getSnapshot().status === 'signedIn' &&
          manager.getSnapshot().user?.id === scope.accountId &&
          onlineManager.isOnline() &&
          AppState.currentState === 'active',
        guard: (scope) => {
          const version = manager.getSignInVersion();
          const access = catalog.captureAccess(scope);
          return (tripId) => {
            if (version !== manager.getSignInVersion()) throw new ApiError('CANCELLED');
            access(tripId ?? undefined);
            if (tripId && !catalog.isVisible(scope, tripId)) throw new ApiError('CANCELLED');
          };
        },
        request: async (userId, path, schema, options) => {
          try {
            return await manager.requestAs(userId, path, schema, options);
          } catch (error) {
            const match = /^\/trips\/([^/]+)\/expenses\//.exec(path);
            if (
              match &&
              error instanceof ApiError &&
              error.source === 'request' &&
              (error.status === 403 || (error.status === 404 && error.code === 'NOT_FOUND'))
            )
              await catalog
                .deny({ environment: manager.api.baseUrl, accountId: userId }, match[1])
                .catch(() => undefined);
            throw error;
          }
        },
        changed: (scope) => {
          void client.invalidateQueries({ queryKey: keyOf(scope) });
        },
        committed: async (scope, tripId, result) => {
          // Normal authorized landing/options reads establish D snapshots, never the join receipt.
          await Promise.all([
            refreshTripData(
              client,
              scope.environment,
              scope.accountId,
              tripId,
              result.status === 'committed' &&
                result.operation === 'expense.delete' &&
                'expenseId' in result.result
                ? result.result.expenseId
                : undefined
            ),
            client.invalidateQueries({
              queryKey: [scope.environment, scope.accountId, 'expense-options', tripId],
            }),
          ]);
        },
      })
  );
  return (
    <Context.Provider value={entry}>
      <Recovery />
      {children}
    </Context.Provider>
  );
}
export function useTripEntry() {
  const entry = useContext(Context);
  if (!entry) throw new Error('TripEntryProvider missing');
  const { manager, user, status } = useAuth();
  const scope = useMemo(
    () => (user ? { environment: manager.api.baseUrl, accountId: user.id } : null),
    [manager.api.baseUrl, user]
  );
  const records = useQuery({
    queryKey: keyOf(scope),
    enabled: !!scope,
    networkMode: 'always',
    staleTime: 0,
    queryFn: () => entry.list(scope!),
  });
  return { entry, scope, records, status, manager };
}
function Recovery() {
  const { entry, scope, status } = useTripEntry();
  useEffect(() => {
    if (!scope || status !== 'signedIn') return;
    let running = false;
    const run = () => {
      if (running || !onlineManager.isOnline() || AppState.currentState !== 'active') return;
      running = true;
      void entry
        .recover(scope)
        .catch(() => undefined)
        .finally(() => {
          running = false;
        });
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
  }, [entry, scope, status]);
  return null;
}
