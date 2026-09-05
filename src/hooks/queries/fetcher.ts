import type { ActionResult } from '@/actions';

interface PublicEndpoint {
  /** Path relative to /api/public/trips/{tripId}/, e.g. '' for trip, 'itinerary' */
  path: string;
  /**
   * Key in the public JSON response holding the data, e.g. 'itinerary'.
   * Omit when the response body itself is the data (e.g. settlement returns
   * `{ balances, transactions, totalExpenses }` at the top level).
   */
  responseKey?: string;
}

type AccessMode = 'member' | 'public';
const accessModeByTrip = new Map<string, Promise<AccessMode>>();
const resolvedAt = new Map<string, number>();

async function fetchPublic<T>(tripId: string, endpoint: PublicEndpoint, defaultValue: T) {
  const res = await fetch(`/api/public/trips/${tripId}/${endpoint.path}`);
  if (!res.ok) throw new Error(`Failed to load (${res.status})`);
  const json = await res.json();
  const value = endpoint.responseKey ? json[endpoint.responseKey] : json;
  return (value ?? defaultValue) as T;
}

/** Test/logout utility; normal sessions are isolated by the hard navigation on auth changes. */
export function clearTripAccessModes() {
  accessModeByTrip.clear();
  resolvedAt.clear();
}

/**
 * Shared queryFn for trip-scoped data with the public-share fallback.
 *
 * The Server Action already encodes authorization. Depending on the action,
 * logged-out visitors return UNAUTHORIZED while logged-in non-members return
 * FORBIDDEN or NOT_FOUND (the latter avoids revealing that a private trip
 * exists). We try the action first, then use the public hash-code endpoint for
 * all three cases. The public endpoint independently validates the hash code,
 * so an ObjectId or an unknown code still returns 404.
 *
 * Throwing (rather than returning a default) is intentional: it keeps
 * `isError` meaningful instead of silently rendering empty data.
 */
export async function fetchWithPublicFallback<T>(
  tripId: string,
  serverAction: (tripId: string) => Promise<ActionResult<T>>,
  publicEndpoint: PublicEndpoint,
  defaultValue: T,
  authenticated = true
): Promise<T> {
  if (!authenticated) return fetchPublic(tripId, publicEndpoint, defaultValue);

  // Recheck remote membership changes on the next resource refetch after 30s.
  const timestamp = resolvedAt.get(tripId);
  if (timestamp !== undefined && Date.now() - timestamp >= 30_000) {
    accessModeByTrip.delete(tripId);
    resolvedAt.delete(tripId);
  }

  const knownMode = accessModeByTrip.get(tripId);
  if (knownMode && (await knownMode) === 'public') {
    return fetchPublic(tripId, publicEndpoint, defaultValue);
  }

  let resolveMode: ((mode: AccessMode) => void) | undefined;
  const ownsResolution = !knownMode;
  if (ownsResolution) {
    accessModeByTrip.set(
      tripId,
      new Promise<AccessMode>((resolve) => {
        resolveMode = resolve;
      })
    );
  }
  const resolution = knownMode ?? accessModeByTrip.get(tripId);
  const stillCurrent = () => accessModeByTrip.get(tripId) === resolution;

  let result: Awaited<ReturnType<typeof serverAction>>;
  try {
    result = await serverAction(tripId);
  } catch (error) {
    // Release callers waiting for access resolution. They will enforce auth again.
    resolveMode?.('member');
    if (ownsResolution && stillCurrent()) accessModeByTrip.delete(tripId);
    throw error;
  }

  if (result.success) {
    resolveMode?.('member');
    if (stillCurrent()) resolvedAt.set(tripId, Date.now());
    return result.data;
  }

  if (
    result.code === 'FORBIDDEN' ||
    result.code === 'UNAUTHORIZED' ||
    result.code === 'NOT_FOUND'
  ) {
    const current = stillCurrent();
    if (resolveMode) resolveMode('public');
    else if (current) accessModeByTrip.set(tripId, Promise.resolve('public'));
    if (current) resolvedAt.set(tripId, Date.now());
    return fetchPublic(tripId, publicEndpoint, defaultValue);
  }

  resolveMode?.('member');
  if (ownsResolution && stillCurrent()) accessModeByTrip.delete(tripId);
  throw new Error(result.error);
}
