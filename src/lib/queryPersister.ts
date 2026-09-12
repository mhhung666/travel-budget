import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { CreateExpenseVars, ExpenseCreateContext } from './offlineMutations';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';

/**
 * IndexedDB-backed persister for the TanStack Query cache (ROADMAP #5 Phase 1).
 *
 * Persisting query results to IndexedDB is what makes the app readable offline:
 * trip/expense/settlement data fetched via server actions is dehydrated to disk
 * and rehydrated on next load, so a previously-viewed trip still renders with no
 * network. IndexedDB (not localStorage) because a long trip's expense list can
 * exceed localStorage's ~5MB budget.
 *
 * Bump {@link PERSIST_BUSTER} whenever the cached shape changes (or query keys
 * are restructured) so stale caches are dropped instead of rehydrated wrong.
 */

const LEGACY_IDB_KEY = 'travel-budget-rq-cache';
const IDB_KEY_PREFIX = `${LEGACY_IDB_KEY}:`;

/** Cache-shape version. Bump to invalidate every client's persisted cache. */
export const PERSIST_BUSTER = 'v9';

/** 7 days: long enough to cover a trip offline, short enough to self-clean. */
export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function getQueryPersistKey(cacheScope: string): string {
  return `${IDB_KEY_PREFIX}${encodeURIComponent(cacheScope)}`;
}

export function createQueryPersister(cacheScope: string) {
  return createAsyncStoragePersister({
    key: getQueryPersistKey(cacheScope),
    deserialize: (serialized) => {
      const client: PersistedClient = JSON.parse(serialized);
      for (const mutation of client.clientState.mutations) {
        if (
          mutation.mutationKey?.[0] === 'expenses' &&
          mutation.mutationKey?.[1] === 'create' &&
          mutation.state.status === 'pending'
        ) {
          // The previous page's in-flight request no longer has a live retryer.
          // Restore it as paused so resumePausedMutations can replay the same key.
          mutation.state.isPaused = true;
          const vars = mutation.state.variables as CreateExpenseVars;
          const context = mutation.state.context as ExpenseCreateContext | undefined;
          // Legacy queues already carry a UUID in their placeholder. Reuse it so even
          // a second reload before the upgraded cache flush gets the same request key.
          const legacyId = context?.optimisticId?.replace(/^optimistic_/, '');
          if (vars?.input && !vars.input.client_request_id) {
            vars.input.client_request_id =
              legacyId && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(legacyId)
                ? legacyId
                : crypto.randomUUID();
          }
        }
      }
      return client;
    },
    storage: {
      getItem: (key) => get(key),
      setItem: (key, value) => set(key, value),
      removeItem: (key) => del(key),
    },
    // Coalesce rapid cache writes (navigating between trip tabs) into one flush.
    throttleTime: 1000,
  });
}

/** Remove the pre-user-partition cache. It must never be restored by newer builds. */
export async function removeLegacyQueryCache(): Promise<void> {
  await del(LEGACY_IDB_KEY);
}
