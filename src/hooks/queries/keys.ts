/**
 * Centralized TanStack Query key factory.
 *
 * All trip-scoped data is nested under ['trip', tripId, ...] so a single
 * `invalidateQueries({ queryKey: tripKeys.all(tripId) })` can refresh an entire
 * trip after a mutation, while finer keys allow targeted invalidation.
 *
 * `tripId` here may be an ObjectId string or a public hash_code — the same
 * dual-acceptance the actions/public API use — so keys stay stable per URL.
 */
export const tripKeys = {
  currentUser: ['currentUser'] as const,
  list: ['trips'] as const,
  visitedPlaces: ['visitedPlaces'] as const,
  all: (tripId: string) => ['trip', tripId] as const,
  detail: (tripId: string) => ['trip', tripId, 'detail'] as const,
  members: (tripId: string) => ['trip', tripId, 'members'] as const,
  expenses: (tripId: string) => ['trip', tripId, 'expenses'] as const,
  settlement: (tripId: string) => ['trip', tripId, 'settlement'] as const,
  itinerary: (tripId: string) => ['trip', tripId, 'itinerary'] as const,
  checklists: (tripId: string) => ['trip', tripId, 'checklists'] as const,
  stats: (tripId: string) => ['trip', tripId, 'stats'] as const,
} as const;
