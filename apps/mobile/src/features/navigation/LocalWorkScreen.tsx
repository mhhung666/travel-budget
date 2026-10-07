import { router } from 'expo-router';
import { Action, DetailRow, Notice, Page } from '@/components/ui';
import { PageHeader } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { useAuth } from '@/features/auth/AuthProvider';
import { useExpenseQueue } from '@/features/expenses/entryProvider';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useMessages } from '@/i18n/useMessages';

export function LocalWorkScreen() {
  const { status } = useAuth();
  const { records: queue } = useExpenseQueue();
  const { records: operations } = useTripEntry();
  const t = useMessages();
  return (
    <Page>
      <PageHeader
        title={t.localWork}
        backLabel={t.backShort}
        onBack={() => goBack(status === 'local' ? '/drafts' : '/me')}
      />
      <Action
        label={t.localDrafts}
        testID="local-drafts"
        variant="secondary"
        onPress={() => router.push('/drafts')}
      />
      {queue.isError ? (
        <Notice tone="danger">{t.queueFailed}</Notice>
      ) : queue.isPending ? (
        <Notice role="status">{t.loading}</Notice>
      ) : (
        <DetailRow
          label={t.queueTitle}
          value={String(queue.data?.filter((record) => record.status !== 'resolved').length ?? 0)}
        />
      )}
      <Action
        label={t.queueTitle}
        testID="local-queue"
        variant="secondary"
        onPress={() => router.push('/queue')}
      />
      {status === 'signedIn' && (
        <>
          {operations.isError ? (
            <Notice tone="danger">{t.queueFailed}</Notice>
          ) : operations.isPending ? (
            <Notice role="status">{t.loading}</Notice>
          ) : (
            <DetailRow
              label={t.pendingOperations}
              value={String(
                operations.data?.filter((record) => record.status === 'pending').length ?? 0
              )}
            />
          )}
          <Action
            label={t.pendingOperations}
            testID="pending-operations"
            variant="secondary"
            onPress={() => router.push('/trips/operations')}
          />
        </>
      )}
    </Page>
  );
}
