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
  mapPhotos: ['mapPhotos'] as const,
  all: (tripId: string) => ['trip', tripId] as const,
  detail: (tripId: string) => ['trip', tripId, 'detail'] as const,
  members: (tripId: string) => ['trip', tripId, 'members'] as const,
  expenses: (tripId: string) => ['trip', tripId, 'expenses'] as const,
  settlement: (tripId: string) => ['trip', tripId, 'settlement'] as const,
  itinerary: (tripId: string) => ['trip', tripId, 'itinerary'] as const,
  checklists: (tripId: string) => ['trip', tripId, 'checklists'] as const,
  copyableChecklists: (tripId: string) => ['trip', tripId, 'copyableChecklists'] as const,
  notes: (tripId: string) => ['trip', tripId, 'notes'] as const,
  stats: (tripId: string) => ['trip', tripId, 'stats'] as const,
  activity: (tripId: string) => ['trip', tripId, 'activity'] as const,
  commentCounts: (tripId: string) => ['trip', tripId, 'commentCounts'] as const,
  comments: (tripId: string, expenseId: string) =>
    ['trip', tripId, 'expense', expenseId, 'comments'] as const,
} as const;

/**
 * Friend query keys. Per-user (not trip-scoped) — the friends list is shared by
 * the settings friends card and the trip-members add-friend buttons.
 */
export const friendKeys = {
  all: ['friends'] as const,
} as const;

/**
 * Notification query keys. Per-user (not trip-scoped), so they live outside the
 * trip key tree: the bell's unread-count badge polls independently of any trip.
 */
export const notificationKeys = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  unreadCount: ['notifications', 'unreadCount'] as const,
} as const;
