import { withLedgerV2, LedgerError, ledgerActionFailure } from '@/lib/ledger';
import { getSession, type SessionPayload } from '@/lib/auth';
import { ErrorCodes, type ActionResult, type ErrorCode } from './types';
import { z } from 'zod';
import { getTripMembership } from '@/lib/permissions';

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

/** Upgraded Web reads and writers use the same server-owned unit context as HTTP v2. */
export function withLedgerAuth<TArgs extends unknown[], TResult>(
  fn: (session: SessionPayload, ...args: TArgs) => Promise<ActionResult<TResult>>
) {
  return withAuth<TArgs, TResult>(
    (session, ...args: TArgs): Promise<ActionResult<TResult>> =>
      withLedgerV2(async (): Promise<ActionResult<TResult>> => {
        try {
          return await fn(session, ...args);
        } catch (error) {
          const failure = ledgerActionFailure(error);
          if (failure) return failure;
          if (error instanceof z.ZodError)
            return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
          const code = (error as { code?: unknown })?.code;
          if (typeof code === 'string' && code in ErrorCodes)
            return {
              success: false,
              error: code,
              code: code as ErrorCode,
              ...(code === 'BUSY' ? { retryAfter: 1 } : {}),
            };
          if (
            (error as { hasErrorLabel?: (label: string) => boolean })?.hasErrorLabel?.(
              'TransientTransactionError'
            )
          )
            return { success: false, error: 'BUSY', code: 'BUSY', retryAfter: 1 };
          return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
        }
      })
  );
}

/** Existing action identities remain TWD-only for older Web/PWA bundles. */
export function withLegacyTripRead<TArgs extends [string, ...unknown[]], TResult>(
  action: (...args: TArgs) => Promise<ActionResult<TResult>>
) {
  return withAuth<TArgs, TResult>(async (session, ...args) => {
    try {
      if (!(await getTripMembership(session.userId, args[0])))
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      return await action(...args);
    } catch (error) {
      if (error instanceof LedgerError)
        return { success: false, error: error.code, code: error.code };
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  });
}
