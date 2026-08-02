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
  defaultValue: T
): Promise<T> {
  const result = await serverAction(tripId);

  if (result.success) return result.data;

  if (
    result.code === 'FORBIDDEN' ||
    result.code === 'UNAUTHORIZED' ||
    result.code === 'NOT_FOUND'
  ) {
    const res = await fetch(`/api/public/trips/${tripId}/${publicEndpoint.path}`);
    if (!res.ok) throw new Error(`Failed to load (${res.status})`);
    const json = await res.json();
    const value = publicEndpoint.responseKey ? json[publicEndpoint.responseKey] : json;
    return (value ?? defaultValue) as T;
  }

  throw new Error(result.error);
}
