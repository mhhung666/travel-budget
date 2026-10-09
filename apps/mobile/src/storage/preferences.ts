import * as SQLite from 'expo-sqlite';
import { createPreferenceStorage } from './preferenceSql';
import type { PreferenceStorage } from '@/features/preferences/store';

let opening: Promise<PreferenceStorage> | undefined;
function open() {
  opening ??= SQLite.openDatabaseAsync('travel-budget-preferences.db')
    .then(createPreferenceStorage)
    .catch((error: unknown) => {
      opening = undefined;
      throw error;
    });
  return opening;
}
export const preferenceStorage: PreferenceStorage = {
  read: async () => (await open()).read(),
  write: async (value) => (await open()).write(value),
};
