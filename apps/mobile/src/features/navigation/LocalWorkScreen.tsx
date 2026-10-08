import { router } from 'expo-router';
import { Action, DetailRow, Notice, Page } from '@/components/ui';
import { PageHeader } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLocalWorkCounts } from '@/features/recovery/useLocalWorkCounts';
import { useMessages } from '@/i18n/useMessages';

export function LocalWorkScreen() {
  const { status } = useAuth();
  const { queue, operations, queueCount, operationCount } = useLocalWorkCounts();
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
      ) : queueCount === undefined ? (
        <Notice role="status">{t.loading}</Notice>
      ) : (
        <DetailRow label={t.queueTitle} value={String(queueCount)} />
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
          ) : operationCount === undefined ? (
            <Notice role="status">{t.loading}</Notice>
          ) : (
            <DetailRow label={t.pendingOperations} value={String(operationCount)} />
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
