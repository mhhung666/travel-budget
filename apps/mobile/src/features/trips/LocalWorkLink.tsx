import { View } from 'react-native';
import { router } from 'expo-router';
import { Notice } from '@/components/ui';
import { EntryGroup } from '@/components/EntryGroup';
import { useLocalWorkCounts } from '@/features/recovery/useLocalWorkCounts';
import { useMessages } from '@/i18n/useMessages';
import { spacing } from '@/theme/tokens';

/** Account-scoped local records only; counts never expose trip names or replace draft state. */
export function LocalWorkLink({
  disabled = false,
  testID = 'local-work',
}: { disabled?: boolean; testID?: string } = {}) {
  const { queue, operations, queueCount, operationCount, showOperations } = useLocalWorkCounts();
  const t = useMessages();
  const failed = queue.isError || (showOperations && operations.isError);
  const loading = queueCount === undefined || (showOperations && operationCount === undefined);
  const counts = [
    queueCount && `${t.queueTitle}: ${queueCount}`,
    showOperations && operationCount && `${t.pendingOperations}: ${operationCount}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={{ gap: spacing.tiny }}>
      <EntryGroup
        entries={[
          {
            testID,
            label: t.localWork,
            detail: failed ? undefined : loading ? t.loading : counts || undefined,
            disabled,
            onPress: () => router.push('/work'),
          },
        ]}
      />
      {failed && <Notice tone="warning">{t.localStatusUnavailable}</Notice>}
    </View>
  );
}
