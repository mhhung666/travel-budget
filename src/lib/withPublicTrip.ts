import { NextRequest, NextResponse } from 'next/server';
import { getTripIdByHashCode } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { PublicApiError, apiError } from '@/lib/publicApiError';

/** Context handed to a public-route handler after the trip param is resolved. */
export type PublicTripContext<P> = {
  request: NextRequest;
  /** Resolved trip `_id` string (the route's hash_code param mapped to an ObjectId). */
  tripId: string;
  /** The awaited route params (e.g. `{ id }`, or `{ tripId, username }`). */
  params: P;
};

type PublicTripHandler<P> = (ctx: PublicTripContext<P>) => Promise<NextResponse>;

type Options = {
  /** Which route param carries the trip hash_code. Defaults to `'id'`. */
  tripParam?: string;
  /** Label used for the structured 500 log line. */
  logLabel?: string;
};

/**
 * Wrapper for the unauthenticated `/api/public/*` share routes.
 *
 * Collapses the boilerplate every public route otherwise repeats:
 *  - `await params` and pull out the trip hash_code param,
 *  - resolve it via `getTripIdByHashCode` (hash_code only — ObjectId is rejected
 *    by design; see the `tripIdOrCode` convention in CLAUDE.md),
 *  - return a structured `NOT_FOUND` 404 when it does not resolve,
 *  - convert any thrown error into a structured `INTERNAL_ERROR` 500 (logged).
 *
 * The wrapped handler only contains the route-specific query + DTO mapping and
 * receives the already-resolved `tripId`.
 */
export function withPublicTrip<P extends Record<string, string>>(
  handler: PublicTripHandler<P>,
  options: Options = {}
) {
  const { tripParam = 'id', logLabel = 'Public API error' } = options;

  return async (request: NextRequest, context: { params: Promise<P> }) => {
    try {
      const params = await context.params;
      const tripId = await getTripIdByHashCode(params[tripParam]);
      if (!tripId) {
        return apiError(PublicApiError.NOT_FOUND, 404);
      }
      return await handler({ request, tripId, params });
    } catch (error) {
      logger.error(logLabel, error);
      return apiError(PublicApiError.INTERNAL_ERROR, 500);
    }
  };
}
