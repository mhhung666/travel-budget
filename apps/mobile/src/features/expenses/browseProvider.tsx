import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { expenseSearchV2Schema } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { isAccessDenied } from '@/features/auth/errorMessage';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { expenseReadGuard, expenseReadWait } from './readGuard';
import { ExpenseSearchReader, searchPath } from './search';
import { ExpenseBrowseRegistry, registerExpenseBrowsers } from './browse';

export function createExpenseBrowseRegistry(
  manager: ReturnType<typeof useAuth>['manager'],
  catalog: ReturnType<typeof useDraftCatalog>['catalog'],
  environment: string,
  accountId: string | undefined,
  version: number
) {
  const scope = accountId ? { environment, accountId } : null;
  let unsavedUntil = 0;
  const current = () =>
    !!scope &&
    manager.api.environment === environment &&
    manager.getSignInVersion() === version &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === accountId;
  return new ExpenseBrowseRegistry(
    (tripId) =>
      new ExpenseSearchReader({
        guard: async () => {
          if (!scope || !current()) throw new ApiError('CANCELLED');
          return expenseReadGuard(manager, catalog, scope, tripId, unsavedUntil);
        },
        read: (filters, cursor, beforeSend, signal) =>
          manager.requestAs(
            accountId!,
            searchPath(tripId, filters, cursor),
            expenseSearchV2Schema,
            { beforeSend, signal }
          ),
        failure: async (error) => {
          if (!scope || !current()) return;
          const wait = expenseReadWait(error);
          if (wait) {
            unsavedUntil = Math.max(unsavedUntil, wait);
            try {
              await (await openMutationStore()).pause(scope, unsavedUntil);
            } catch {
              throw new ApiError('STORAGE');
            }
          }
          if (isAccessDenied(error)) await catalog.deny(scope, tripId);
        },
      })
  );
}

const Context = createContext<ExpenseBrowseRegistry | null>(null);
export function ExpenseBrowseProvider({ children }: PropsWithChildren) {
  const { manager, user, status } = useAuth();
  const { catalog } = useDraftCatalog();
  const client = useQueryClient();
  const version = manager.getSignInVersion();
  const environment = manager.api.environment;
  const accountId = status === 'signedIn' ? user?.id : undefined;
  const registry = useMemo(
    () => createExpenseBrowseRegistry(manager, catalog, environment, accountId, version),
    [manager, catalog, environment, accountId, version]
  );
  useEffect(() => {
    if (!accountId) return () => registry.dispose();
    const stop = registerExpenseBrowsers(client, environment, accountId, registry);
    const purge = () =>
      registry.denyHidden((id) => catalog.isVisible({ environment, accountId }, id));
    const unsubscribe = catalog.subscribe(purge);
    const lifecycle = AppState.addEventListener('change', (state) => {
      if (state === 'active') registry.resume();
      else registry.suspend();
    });
    purge();
    return () => {
      unsubscribe();
      lifecycle.remove();
      stop();
    };
  }, [registry, catalog, client, environment, accountId]);
  return <Context.Provider value={registry}>{children}</Context.Provider>;
}
export function useExpenseBrowse(tripId: string) {
  const registry = useContext(Context);
  if (!registry) throw new Error('ExpenseBrowseProvider is missing');
  const session = registry.get(tripId);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { session, state };
}
