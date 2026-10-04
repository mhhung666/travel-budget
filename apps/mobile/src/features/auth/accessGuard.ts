import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { isAccessDenied } from './errorMessage';

/**
 * Runs a private-resource read so that a recorded access denial outlives transient failures.
 *
 * After the server says "no access" (lost membership, unknown resource) the screens hide the cached
 * data. A later retry that times out, goes offline or hits a 5xx would replace the query's error and
 * make that data visible again. Instead the earlier denial is rethrown, so it stays the query's error
 * (next to the hidden data, and across leaving and returning to the screen) until a read succeeds,
 * which also proves access was restored. Ordinary failures without a prior denial are untouched, so
 * legitimate stale data stays visible while offline.
 */
export async function keepAccessDenial<T>(
  client: QueryClient,
  queryKey: QueryKey,
  read: () => Promise<T>
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const previous = client.getQueryState(queryKey)?.error;
    if (isAccessDenied(previous) && !isAccessDenied(error)) throw previous;
    throw error;
  }
}

/**
 * Records a denial that a different request found out, such as a refused expense preview, as the
 * error of the query that holds the private data. From then on that data stays hidden exactly as
 * if the query had been refused itself: through later transient failures and across leaving and
 * returning to the screen, until a read of it succeeds. Only a lost-access answer is recorded;
 * other failures prove nothing about access. A resource that was never read has nothing to hide.
 */
export function recordAccessDenial(client: QueryClient, queryKey: QueryKey, error: unknown) {
  if (!(error instanceof ApiError) || !isAccessDenied(error)) return;
  const query = client.getQueryCache().find({ queryKey, exact: true });
  query?.setState({
    status: 'error',
    error,
    errorUpdatedAt: Date.now(),
    errorUpdateCount: query.state.errorUpdateCount + 1,
  });
}
