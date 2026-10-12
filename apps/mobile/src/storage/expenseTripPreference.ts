import * as SQLite from 'expo-sqlite';
import { createLastExpenseTripStore, type LastExpenseTripStore } from './lastExpenseTrip';

let opening: Promise<LastExpenseTripStore> | undefined;
export function openLastExpenseTripStore() {
  opening ??= SQLite.openDatabaseAsync('travel-budget-preferences.db')
    .then(createLastExpenseTripStore)
    .catch((error: unknown) => {
      opening = undefined;
      throw error;
    });
  return opening;
}
