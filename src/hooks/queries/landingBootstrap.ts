import type { QueryClient } from '@tanstack/react-query';
import type { TripLanding } from '@/types/tripLanding';
import { tripKeys } from './keys';

// Only coalesce an in-flight cold landing. Existing resource keys remain the source
// of truth for persistence, optimistic writes and fine-grained invalidation.
const flights = new WeakMap<QueryClient, Map<string, Promise<TripLanding>>>();

export async function bootstrapLanding<K extends 'trip' | 'shell' | 'itinerary'>(
  client: QueryClient,
  id: string,
  field: K,
  load: () => Promise<TripLanding>,
  fallback: () => Promise<TripLanding[K]>
): Promise<TripLanding[K]> {
  let pending = flights.get(client);
  if (!pending) {
    pending = new Map();
    flights.set(client, pending);
  }
  const current = pending.get(id);
  if (current) return (await current)[field];
  const keys = [tripKeys.detail(id), tripKeys.shell(id), tripKeys.itinerary(id)];
  if (keys.some((key) => client.getQueryData(key) !== undefined)) return fallback();
  const anchors = keys.map((queryKey) => client.getQueryCache().find({ queryKey, exact: true }));

  const promise = load().then((data) => {
    // Never overwrite a cache entry populated by a concurrent mutation or refetch.
    // Removed queries (e.g. logout) must not be resurrected by a late response.
    if (anchors.some((query) => query && client.getQueryCache().get(query.queryHash) === query)) {
      const entries = [
        [tripKeys.detail(id), data.trip],
        [tripKeys.shell(id), data.shell],
        [tripKeys.itinerary(id), data.itinerary],
        [tripKeys.checklists(id), data.checklists],
        [tripKeys.settlement(id), data.settlement],
      ] as const;
      for (const [key, value] of entries) {
        if (value !== null && client.getQueryData(key) === undefined)
          client.setQueryData(key, value);
      }
    }
    return data;
  });
  pending.set(id, promise);
  try {
    return (await promise)[field];
  } finally {
    if (pending.get(id) === promise) pending.delete(id);
  }
}
