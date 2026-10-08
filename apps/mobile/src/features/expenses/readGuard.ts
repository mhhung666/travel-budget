import { AppState } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import type { SessionManager } from '@/api/session';
import type { DraftCatalog } from '@/features/localDrafts/catalog';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import type { PendingScope } from '@/storage/pendingExpenses';
import { LocalRateLimitError } from './entry';

/** Capture access/login before SQLite waits; validate synchronously before each transport attempt. */
export async function expenseReadGuard(
  manager: SessionManager,
  catalog: DraftCatalog,
  scope: PendingScope,
  tripId: string,
  unsavedUntil = 0,
  allowHidden = false
) {
  const captured = catalog.captureAccess(scope);
  const version = manager.getSignInVersion();
  const store = await openMutationStore();
  // A failed 429 save must succeed before another form read/write is permitted.
  if (unsavedUntil > Date.now()) await store.pause(scope, unsavedUntil);
  await store.retryAt(scope);
  return () => {
    if (
      manager.getSignInVersion() !== version ||
      manager.getSnapshot().status !== 'signedIn' ||
      manager.getSnapshot().user?.id !== scope.accountId ||
      manager.api.environment !== scope.environment ||
      !onlineManager.isOnline() ||
      AppState.currentState !== 'active'
    )
      throw new ApiError('CANCELLED');
    captured(tripId);
    if (!allowHidden && !catalog.isVisible(scope, tripId)) throw new ApiError('CANCELLED');
    const until = store.rateLimitUntil(scope);
    if (until > Date.now()) throw new LocalRateLimitError(until, Date.now());
  };
}
/** Only an actual server 429 extends the deadline; local waits never move it forward. */
export function expenseReadWait(error: unknown) {
  return error instanceof ApiError &&
    error.status === 429 &&
    !(error instanceof LocalRateLimitError)
    ? Date.now() + (error.retryAfter ?? 30) * 1000
    : 0;
}
