import type { DraftCatalog } from '@/features/localDrafts/catalog';
import type { QueuedExpense } from '@/storage/expenseQueue';
import type { PendingMutation } from '@/storage/mutations';
import type { PendingScope } from '@/storage/pendingExpenses';

type VisibilityCatalog = Pick<DraftCatalog, 'isVisible'>;
const sameScope = (record: PendingScope, scope: PendingScope | null) =>
  !!scope && record.environment === scope.environment && record.accountId === scope.accountId;

/** The caller retains its login-generation guard; queue local access differs from E operations. */
export function queueRecordVisible(
  record: QueuedExpense,
  scope: PendingScope | null,
  catalog: VisibilityCatalog
) {
  return sameScope(record, scope) && catalog.isVisible(record, record.tripId);
}
export function operationRecordVisible(
  record: PendingMutation,
  scope: PendingScope | null,
  catalog: VisibilityCatalog
) {
  const tripId =
    record.tripId ?? (record.result?.status === 'committed' ? record.result.result.tripId : null);
  return sameScope(record, scope) && (!tripId || catalog.isVisible(record, tripId));
}
