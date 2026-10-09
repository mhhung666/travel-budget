import { useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { preferenceStorage } from '@/storage/preferences';
import { PreferencesContext } from './context';
import { PreferenceStore } from './store';

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => new PreferenceStore(preferenceStorage));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.start();
  }, [store]);
  return (
    <PreferencesContext.Provider value={store}>
      {state.ready ? children : null}
    </PreferencesContext.Provider>
  );
}
