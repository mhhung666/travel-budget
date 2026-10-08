import { useAuth } from '@/features/auth/AuthProvider';
import { useExpenseQueue } from '@/features/expenses/entryProvider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { useTripEntry } from '@/features/tripEntry/provider';
import { operationRecordVisible, queueRecordVisible } from './visibility';

/** Only visible, nonterminal records contribute to the pending counts. Read errors stay errors. */
export function useLocalWorkCounts() {
  const { user, manager, status } = useAuth();
  const { catalog } = useDraftCatalog();
  const queue = useExpenseQueue().records;
  const operations = useTripEntry().records;
  const scope = user ? { environment: manager.api.baseUrl, accountId: user.id } : null;
  return {
    showOperations: status === 'signedIn',
    queue,
    operations,
    queueCount:
      queue.isError || queue.isPending || !scope
        ? undefined
        : (queue.data?.filter(
            (r) => r.status !== 'resolved' && queueRecordVisible(r, scope, catalog)
          ).length ?? 0),
    operationCount:
      operations.isError || operations.isPending || !scope || status !== 'signedIn'
        ? undefined
        : (operations.data?.filter(
            (r) => r.status === 'pending' && operationRecordVisible(r, scope, catalog)
          ).length ?? 0),
  };
}
