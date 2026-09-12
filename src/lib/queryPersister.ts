import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { CreateExpenseVars, ExpenseCreateContext } from './offlineMutations';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';
import { createExpenseOutbox } from './expenseOutbox';
import { buildOptimisticExpense } from './optimisticExpense';
import { tripKeys } from '@/hooks/queries/keys';
import { replaceEqualDeep } from '@tanstack/react-query';
import type { Expense } from '@/types';

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
  let active = true;
  const cache = createAsyncStoragePersister({
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
      setItem: (key, value) => (active ? set(key, value) : Promise.resolve()),
      removeItem: (key) => del(key),
    },
    // Coalesce rapid cache writes (navigating between trip tabs) into one flush.
    throttleTime: 1000,
  });
  const outbox = createExpenseOutbox(cacheScope);
  return {
    ...cache,
    stop: () => {
      active = false;
    },
    // Cache expiry/restore failures may call removeClient; only explicit logout clears the journal.
    removeClient: cache.removeClient,
    restoreClient: async () => {
      let saved;
      try {
        saved = await cache.restoreClient();
      } catch {
        /* A damaged read cache must not hide the independent outbox. */
      }
      let entries = await outbox.read();
      // Import old queues before allowing cache expiry/buster handling to remove them.
      for (const mutation of saved?.clientState.mutations ?? []) {
        const vars = mutation.state.variables as CreateExpenseVars;
        if (
          mutation.mutationKey?.[0] === 'expenses' &&
          mutation.mutationKey?.[1] === 'create' &&
          vars?.input?.client_request_id &&
          !entries[vars.input.client_request_id]
        ) {
          await outbox.write({
            vars,
            context: mutation.state.context as ExpenseCreateContext,
            status: mutation.state.status === 'error' ? 'failed' : 'pending',
            createdAt: mutation.state.submittedAt,
          });
        }
      }
      entries = await outbox.read();
      const fresh =
        saved && saved.buster === PERSIST_BUSTER && Date.now() - saved.timestamp <= PERSIST_MAX_AGE;
      const client: PersistedClient = fresh
        ? saved!
        : {
            timestamp: Date.now(),
            buster: PERSIST_BUSTER,
            clientState: { mutations: [], queries: [] },
          };
      client.clientState.mutations = client.clientState.mutations.filter(
        (m) => m.mutationKey?.[0] !== 'expenses' || m.mutationKey?.[1] !== 'create'
      );
      const placeholders = new Map<string, Expense>();
      // The journal is authoritative; stale query snapshots must not resurrect placeholders.
      for (const query of client.clientState.queries) {
        if (
          query.queryKey[0] === 'trip' &&
          query.queryKey[2] === 'expenses' &&
          Array.isArray(query.state.data)
        ) {
          for (const expense of query.state.data as Expense[])
            placeholders.set(expense.id, expense);
          query.state.data = (query.state.data as Expense[]).filter(
            (e) => !e.id.startsWith('optimistic_')
          );
        }
      }
      for (const entry of Object.values(entries)) {
        const shell = client.clientState.queries.find(
          (q) => JSON.stringify(q.queryKey) === JSON.stringify(tripKeys.shell(entry.vars.tripId))
        );
        const contextProjection = entry.context;
        if (shell && contextProjection?.previousShell && contextProjection.appliedShell) {
          if (
            entry.status === 'failed' &&
            replaceEqualDeep(contextProjection.appliedShell, shell.state.data) ===
              contextProjection.appliedShell
          )
            shell.state.data = contextProjection.previousShell;
          if (
            entry.status === 'pending' &&
            replaceEqualDeep(contextProjection.previousShell, shell.state.data) ===
              contextProjection.previousShell
          )
            shell.state.data = contextProjection.appliedShell;
        }
        if (
          entry.status === 'done' &&
          entry.expense &&
          fresh &&
          saved!.timestamp < (entry.updatedAt ?? 0)
        ) {
          const query = client.clientState.queries.find(
            (q) =>
              JSON.stringify(q.queryKey) === JSON.stringify(tripKeys.expenses(entry.vars.tripId))
          );
          if (query)
            query.state.data = [
              entry.expense,
              ...(query.state.data as Expense[]).filter((e) => e.id !== entry.expense!.id),
            ];
        }
        if (entry.status !== 'pending') continue;
        const { vars } = entry;
        const optimisticId =
          entry.context?.optimisticId ?? `optimistic_${vars.input.client_request_id}`;
        const context = entry.context ?? { optimisticId, wasOffline: true };
        client.clientState.mutations.push({
          mutationKey: ['expenses', 'create'],
          state: {
            context,
            variables: vars,
            data: undefined,
            error: null,
            failureCount: 0,
            failureReason: null,
            isPaused: true,
            status: 'pending',
            submittedAt: entry.createdAt,
          },
        });
        const queryKey = tripKeys.expenses(vars.tripId);
        let query = client.clientState.queries.find(
          (q) => JSON.stringify(q.queryKey) === JSON.stringify(queryKey)
        );
        if (!query) {
          query = {
            queryKey,
            queryHash: JSON.stringify(queryKey),
            state: {
              data: [],
              dataUpdateCount: 1,
              dataUpdatedAt: 0,
              error: null,
              errorUpdateCount: 0,
              errorUpdatedAt: 0,
              fetchFailureCount: 0,
              fetchFailureReason: null,
              fetchMeta: null,
              isInvalidated: true,
              status: 'success',
              fetchStatus: 'idle',
            },
          };
          client.clientState.queries.push(query);
        }
        query.state.data = [
          placeholders.get(optimisticId) ??
            buildOptimisticExpense(vars.input, {
              tripId: vars.tripId,
              id: optimisticId,
              members: [],
              createdAt: new Date(entry.createdAt).toISOString(),
            }),
          ...(query.state.data as Expense[]),
        ];
      }
      return client;
    },
  };
}

/** Remove the pre-user-partition cache. It must never be restored by newer builds. */
export async function removeLegacyQueryCache(): Promise<void> {
  await del(LEGACY_IDB_KEY);
}
