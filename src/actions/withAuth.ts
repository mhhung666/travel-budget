import { getSession, type SessionPayload } from '@/lib/auth';
import type { ActionResult } from './types';

/**
 * Higher-order function that wraps a Server Action with authentication.
 * Eliminates the repeated session check boilerplate across all actions.
 *
 * @example
 * export const getTrips = withAuth(async (session) => {
 *   // session is guaranteed to be valid here
 *   const { userId } = session;
 *   // ... business logic
 * });
 */
export function withAuth<TArgs extends unknown[], TResult>(
  fn: (session: SessionPayload, ...args: TArgs) => Promise<ActionResult<TResult>>
) {
  return async (...args: TArgs): Promise<ActionResult<TResult>> => {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }
    return fn(session, ...args);
  };
}
