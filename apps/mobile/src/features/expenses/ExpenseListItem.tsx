import { Text, View } from 'react-native';
import { usePalette } from '@/components/ui';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { spacing, typography } from '@/theme/tokens';
import { ExpenseRow, type ExpenseRowProps } from './ExpenseRow';

/** Date headings live outside the one-button row; both lists supply the same day boundaries. */
export function ExpenseListItem(props: ExpenseRowProps) {
  const p = usePalette();
  const f = useDisplayFormat();
  return (
    <View>
      {props.startOfDay && (
        <Text
          testID={`expense-day-${props.expense.date}`}
          accessibilityRole="header"
          style={[
            typography.label,
            { color: p.muted, fontWeight: '600', marginBottom: spacing.small },
          ]}
        >
          {f.date(props.expense.date)}
        </Text>
      )}
      <ExpenseRow {...props} />
    </View>
  );
}
