'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * These routes have no server-provided query data. Persisted IndexedDB data may
 * arrive before a streamed page hydrates; do not hydrate cached content against
 * the server's loading markup. Keep the shell SSR, then mount query content.
 */
export function ClientQueryBoundary({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return hydrated ? children : fallback;
}
