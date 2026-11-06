import {
  activityDeletionPreviewSchema,
  type ActivityDeletionPreviewInput,
  type ActivityDeletionPreview,
  type ItineraryEditContext,
  type ItineraryDay,
} from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { LocalRateLimitError, type EntryRequest } from '@/features/expenses/entry';
import type { MutationStore } from '@/storage/mutations';
import type { PendingScope } from '@/storage/pendingExpenses';

export type BatchDay = ItineraryEditContext['days'][number];
export type BatchSelection = {
  day: Pick<BatchDay, 'id' | 'title' | 'date'> & { dayNumber: number | null };
  targets: ActivityDeletionPreviewInput['targets'];
  // Labels are only held in page memory, never persisted in the operation envelope.
  labels: Record<string, string>;
  contextRevision?: string;
};
export function selectedContextChanged(
  selection: BatchSelection,
  preview: ActivityDeletionPreview
) {
  return (
    preview.changedIds.length > 0 ||
    selection.day.title !== preview.title ||
    selection.day.date !== preview.date ||
    selection.day.dayNumber !== preview.dayNumber ||
    (!!selection.contextRevision && selection.contextRevision !== preview.contextRevision)
  );
}
export function itinerarySelectionSignature(day: ItineraryDay | undefined, ids: string[]) {
  if (!day) return 'missing';
  return JSON.stringify([
    day.title,
    day.dayNumber,
    day.date,
    ids
      .slice()
      .sort()
      .map((id) => day.activities.find((a) => a.id === id) ?? id),
  ]);
}
export async function readActivityDeletionPreview(deps: {
  request: EntryRequest;
  store: () => Promise<MutationStore>;
  scope: PendingScope;
  tripId: string;
  input: ActivityDeletionPreviewInput;
  guard: () => void;
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
    const data = activityDeletionPreviewSchema.parse(
      await deps.request(
        deps.scope.accountId,
        `/trips/${deps.tripId}/itinerary/activity-deletions/preview`,
        activityDeletionPreviewSchema,
        { method: 'POST', body: deps.input, beforeSend: check }
      )
    );
    check();
    const ids = deps.input.targets.map((t) => t.activityId);
    const returned = [...data.targets.map((t) => t.activityId), ...data.missingIds];
    if (
      data.tripId !== deps.tripId ||
      data.dayId !== deps.input.dayId ||
      returned.length !== ids.length ||
      new Set(returned).size !== ids.length ||
      ids.some((id) => !returned.includes(id)) ||
      data.changedIds.some((id) => !data.targets.some((t) => t.activityId === id))
    )
      throw new ApiError('INVALID_RESPONSE');
    return data;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.source === 'request' &&
      error.status === 429 &&
      !(error instanceof LocalRateLimitError)
    )
      await store.pause(deps.scope, now() + (error.retryAfter ?? 30) * 1000);
    // NOT_FOUND may mean only the day disappeared. Do not hide the entire trip.
    throw error;
  }
}
