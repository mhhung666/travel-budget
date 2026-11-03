import { itineraryEditContextSchema } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { LocalRateLimitError, type EntryRequest } from '@/features/expenses/entry';
import type { MutationStore } from '@/storage/mutations';
import type { PendingScope } from '@/storage/pendingExpenses';

export async function readItineraryEditContext(deps: {
  request: EntryRequest;
  store: () => Promise<MutationStore>;
  scope: PendingScope;
  tripId: string;
  guard: () => void;
  deny: () => Promise<unknown>;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  deps.guard();
  const store = await deps.store();
  await store.retryAt(deps.scope);
  const check = () => {
    deps.guard();
    const until = store.rateLimitUntil(deps.scope);
    if (until > now()) throw new LocalRateLimitError(until, now());
  };
  try {
    check();
    const data = await deps.request(
      deps.scope.accountId,
      `/trips/${deps.tripId}/itinerary/edit-context`,
      itineraryEditContextSchema,
      { beforeSend: check }
    );
    check();
    if (data.tripId !== deps.tripId) throw new ApiError('INVALID_RESPONSE');
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.source === 'request') {
      if (error.status === 429 && !(error instanceof LocalRateLimitError))
        await store.pause(deps.scope, now() + (error.retryAfter ?? 30) * 1000);
      if (error.status === 404 && error.code === 'NOT_FOUND') await deps.deny();
      // 403 FORBIDDEN is an admin downgrade, not loss of membership.
    }
    throw error;
  }
}
