import * as SQLite from 'expo-sqlite';
import { createPendingExpenseStore, type PendingExpenseStore } from './pendingExpenses';

const DATABASE = 'travel-budget-pending.db';
let opening: Promise<PendingExpenseStore> | null = null;

/**
 * The device's one pending-expense database, opened on first use. It sits in the app's private
 * storage, apart from the query cache, so clearing the cache never drops a request that may have
 * reached the server. The web preview has no sign-in and bundles `.web.ts` instead.
 */
export function openPendingExpenseStore(): Promise<PendingExpenseStore> {
  opening ??= SQLite.openDatabaseAsync(DATABASE)
    .then(createPendingExpenseStore)
    .catch((error: unknown) => {
      opening = null;
      throw error;
    });
  return opening;
}
