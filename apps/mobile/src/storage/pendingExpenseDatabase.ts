import * as SQLite from 'expo-sqlite';
import {
  createPendingExpenseStore,
  type PendingExpenseStore,
  type SqlDatabase,
} from './pendingExpenses';
import { createDraftTripStore, type DraftTripStore } from './draftTrips';

const DATABASE = 'travel-budget-pending.db';
let database: Promise<SqlDatabase> | null = null;
function openDatabase() {
  database ??= SQLite.openDatabaseAsync(DATABASE).catch((error: unknown) => {
    database = null;
    throw error;
  });
  return database;
}
let catalog: Promise<DraftTripStore> | null = null;
export function openDraftTripStore(): Promise<DraftTripStore> {
  catalog ??= openDatabase()
    .then(createDraftTripStore)
    .catch((error: unknown) => {
      catalog = null;
      throw error;
    });
  return catalog;
}
let opening: Promise<PendingExpenseStore> | null = null;

/**
 * The device's one pending-expense database, opened on first use. It sits in the app's private
 * storage, apart from the query cache, so clearing the cache never drops a request that may have
 * reached the server. The web preview has no sign-in and bundles `.web.ts` instead.
 */
export function openPendingExpenseStore(): Promise<PendingExpenseStore> {
  opening ??= openDatabase()
    .then(createPendingExpenseStore)
    .catch((error: unknown) => {
      opening = null;
      throw error;
    });
  return opening;
}
