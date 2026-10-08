import { View } from 'react-native';
import { router } from 'expo-router';
import { Action, Copy, Notice } from '@/components/ui';
import { useLocalWorkCounts } from '@/features/recovery/useLocalWorkCounts';
import { useMessages } from '@/i18n/useMessages';
import { spacing } from '@/theme/tokens';

/** Account-scoped local records only; counts never expose trip names or replace draft state. */
export function LocalWorkLink() {
  const { queue, operations, queueCount, operationCount, showOperations } = useLocalWorkCounts();
  const t = useMessages();
  const failed = queue.isError || (showOperations && operations.isError);
  const loading = queueCount === undefined || (showOperations && operationCount === undefined);
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
          {t.queueTitle}: {queueCount}
          {showOperations && (
            <>
              {' '}
              · {t.pendingOperations}: {operationCount}
            </>
          )}
        </Copy>
      )}
    </View>
  );
}
