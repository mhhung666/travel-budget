import type { QueryClient } from '@tanstack/react-query';
import { landingSchema, expenseOptionsSchema } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import type { SessionManager } from '@/api/session';
import type { PendingScope } from '@/storage/pendingExpenses';
import type { DraftCatalog } from '@/features/localDrafts/catalog';
import { LocalRateLimitError } from '@/features/expenses/entry';
import { refreshTripData } from '@/features/expenses/entryQueries';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { localDate } from '@/i18n/format';
/** Refresh is read-only: a failure never changes the original committed outcome. */
export async function refreshManagedTrip(
  client: QueryClient,
  manager: SessionManager,
  catalog: DraftCatalog,
  scope: PendingScope,
  tripId: string
) {
  const version = manager.getSignInVersion();
  const access = catalog.captureAccess(scope);
  const store = await openMutationStore();
  await store.retryAt(scope);
  const beforeSend = () => {
    if (
      manager.getSignInVersion() !== version ||
      manager.api.baseUrl !== scope.environment ||
      manager.getSnapshot().status !== 'signedIn' ||
      manager.getSnapshot().user?.id !== scope.accountId
    )
      throw new ApiError('CANCELLED');
    access(tripId);
    if (!catalog.isVisible(scope, tripId)) throw new ApiError('CANCELLED');
    const until = store.rateLimitUntil(scope);
    if (until > Date.now()) throw new LocalRateLimitError(until, Date.now());
  };
  const snapshots = async () => {
    try {
      const landing = await manager.requestAs(
        scope.accountId,
        `/trips/${tripId}/landing?date=${localDate()}`,
        landingSchema,
        { beforeSend }
      );
      beforeSend();
      await catalog.rememberName(scope, tripId, landing.name);
      beforeSend();
      const options = await manager.requestAs(
        scope.accountId,
        `/trips/${tripId}/expense-options`,
        expenseOptionsSchema,
        { beforeSend }
      );
      beforeSend();
      await catalog.rememberOptions(scope, tripId, options);
      beforeSend();
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 429 &&
        !(error instanceof LocalRateLimitError)
      )
        await store.pause(scope, Date.now() + (error.retryAfter ?? 30) * 1000);
      if (error instanceof ApiError && error.status === 404 && error.code === 'NOT_FOUND')
        await catalog.deny(scope, tripId).catch(() => undefined);
      throw error;
    }
  };
  beforeSend();
  // Invalidate all affected read caches even if the durable name/options refresh fails.
  await Promise.all([
    refreshTripData(client, scope.environment, scope.accountId, tripId),
    snapshots(),
  ]);
}
