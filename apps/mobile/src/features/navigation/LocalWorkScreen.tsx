import { PendingReceipts } from '@/features/expenses/PendingReceipts';
import { router } from 'expo-router';
import { Notice, Page, Section } from '@/components/ui';
import { EntryGroup } from '@/components/EntryGroup';
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
      <EntryGroup
        entries={[
          { label: t.localDrafts, testID: 'local-drafts', onPress: () => router.push('/drafts') },
        ]}
      />
      <Section title={t.queueTitle}>
        {queue.isError && <Notice tone="danger">{t.queueFailed}</Notice>}
        {queueCount === undefined && !queue.isError && <Notice role="status">{t.loading}</Notice>}
        <EntryGroup
          entries={[
            {
              label: t.queueTitle,
              detail: queueCount === undefined ? undefined : String(queueCount),
              testID: 'local-queue',
              onPress: () => router.push('/queue'),
            },
          ]}
        />
      </Section>
      {status === 'signedIn' && <PendingReceipts />}
      {status === 'signedIn' && (
        <Section title={t.pendingOperations}>
          {operations.isError && <Notice tone="danger">{t.queueFailed}</Notice>}
          {operationCount === undefined && !operations.isError && (
            <Notice role="status">{t.loading}</Notice>
          )}
          <EntryGroup
            entries={[
              {
                label: t.pendingOperations,
                detail: operationCount === undefined ? undefined : String(operationCount),
                testID: 'pending-operations',
                onPress: () => router.push('/trips/operations'),
              },
            ]}
          />
        </Section>
      )}
    </Page>
  );
}
