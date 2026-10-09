import type { PreferenceStorage } from '@/features/preferences/store';
const key = 'travel-budget.device-preferences.v1';
/** Only appearance/language; Web preview never stores credentials or private account data here. */
export const preferenceStorage: PreferenceStorage = {
  read: async () => localStorage.getItem(key),
  write: async (value) => {
    localStorage.setItem(key, value);
  },
};
