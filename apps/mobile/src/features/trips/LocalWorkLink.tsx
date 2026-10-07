import { View } from 'react-native';
import { router } from 'expo-router';
import { Action, Copy, Notice } from '@/components/ui';
import { useExpenseQueue } from '@/features/expenses/entryProvider';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useMessages } from '@/i18n/useMessages';
import { spacing } from '@/theme/tokens';

/** Account-scoped local records only; counts never expose trip names or replace draft state. */
export function LocalWorkLink() {
  const { records: queue } = useExpenseQueue();
  const { records: operations } = useTripEntry();
  const t = useMessages();
  const failed = queue.isError || operations.isError;
  const loading = queue.isPending || operations.isPending;
  return (
    <View style={{ gap: spacing.tiny }}>
      <Action
        testID="local-work"
        variant="ghost"
        label={t.localWork}
        onPress={() => router.push('/work')}
      />
      {failed ? (
        <Notice tone="warning">{t.localStatusUnavailable}</Notice>
      ) : loading ? (
        <Copy>{t.loading}</Copy>
      ) : (
        <Copy>
          {t.queueTitle}: {queue.data?.filter((record) => record.status !== 'resolved').length ?? 0}
          {' · '}
          {t.pendingOperations}:{' '}
          {operations.data?.filter((record) => record.status === 'pending').length ?? 0}
        </Copy>
      )}
    </View>
  );
}
