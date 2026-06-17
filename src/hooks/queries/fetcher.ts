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
 * The Server Action already encodes authorization: `withAuth` returns
 * UNAUTHORIZED when logged out and FORBIDDEN for non-members. So we try the
 * action first (covers the common logged-in member case in one round trip),
 * and only on those two codes fall back to the unauthenticated public API —
 * which lets a visitor view a shared trip via its hash_code. Any other failure
 * is a real error and is thrown so React Query surfaces it.
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

  if (result.code === 'FORBIDDEN' || result.code === 'UNAUTHORIZED') {
    const res = await fetch(`/api/public/trips/${tripId}/${publicEndpoint.path}`);
    if (!res.ok) throw new Error(`Failed to load (${res.status})`);
    const json = await res.json();
    const value = publicEndpoint.responseKey ? json[publicEndpoint.responseKey] : json;
    return (value ?? defaultValue) as T;
  }

  throw new Error(result.error);
}
