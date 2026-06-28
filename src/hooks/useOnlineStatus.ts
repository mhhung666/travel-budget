'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks browser connectivity via `navigator.onLine` + the `online`/`offline`
 * events. SSR-safe: defaults to `true` (online) on the server and during the
 * first client render so the offline banner never flashes during hydration.
 *
 * Used by the offline indicator (ROADMAP #5 Phase 1) to tell the user the data
 * they're seeing is served from the persisted cache.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
