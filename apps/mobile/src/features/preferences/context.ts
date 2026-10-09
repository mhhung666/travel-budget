import { createContext, useContext, useSyncExternalStore } from 'react';
import type { PreferenceStore } from './store';

export const PreferencesContext = createContext<PreferenceStore | null>(null);
export function usePreferences() {
  const store = useContext(PreferencesContext);
  if (!store) throw new Error('PreferencesProvider is missing');
  return { ...useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot), store };
}
