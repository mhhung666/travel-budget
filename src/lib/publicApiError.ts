import { NextResponse } from 'next/server';

/**
 * Structured error codes returned by the public (unauthenticated) share API
 * under `/api/public/*`. Routes return `{ error: <code> }` instead of plain,
 * mixed-language text so the client can map each code to localized copy
 * (see `member.convertVirtual.errors` in the i18n catalogs).
 *
 * Kept separate from the action-layer `ErrorCodes` (src/actions/types.ts):
 * the virtual-member link/convert flows need finer-grained cases than the
 * six generic action codes can express.
 */
export const PublicApiError = {
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_VIRTUAL_ID: 'INVALID_VIRTUAL_ID',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  NOT_VIRTUAL: 'NOT_VIRTUAL',
  NOT_TRIP_MEMBER: 'NOT_TRIP_MEMBER',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  CANNOT_LINK_VIRTUAL: 'CANNOT_LINK_VIRTUAL',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
} as const;

export type PublicApiErrorCode = (typeof PublicApiError)[keyof typeof PublicApiError];

/** Build a structured error response: `{ error: <code> }` with the given HTTP status. */
export function apiError(code: PublicApiErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status });
}
