import { useState } from 'react';
import { baseCurrency } from '@/api/ledger';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import type { Expense } from '@/api/contracts';
import { Icon } from '@/components/icons';
import { usePalette } from '@/components/ui';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { useMessages } from '@/i18n/useMessages';
import { radius, sizing, spacing, typography } from '@/theme/tokens';
import { categoryIcon, categoryLabel, type MemberLabelIndex, isForeign } from './rows';

export type ExpenseRowProps = {
  expense: Expense;
  tripId: string;
  labels: MemberLabelIndex;
  startOfDay?: boolean;
  endOfDay?: boolean;
};

export function ExpenseRow({
  expense,
  tripId,
  labels,
  startOfDay = true,
  endOfDay = true,
}: ExpenseRowProps) {
  const p = usePalette();
  const t = useMessages(baseCurrency(expense));
  const f = useDisplayFormat(baseCurrency(expense));
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const [measurement, setMeasurement] = useState({ viewportWidth, width: 0 });
  // Measure the content after padding/icon, not the window. A resized window invalidates old width.
  const horizontal =
    measurement.viewportWidth === viewportWidth &&
    fontScale < 1.5 &&
    measurement.width / fontScale >= 280;
  const payer = labels.label({
    id: expense.payerId,
    name: expense.payerName,
    isVirtual: expense.payerIsVirtual,
  });
  const category = categoryLabel(expense.category, t);
  const original = isForeign(expense)
    ? f.originalAmount(expense.originalAmount, expense.currency)
    : null;
  return (
    <Pressable
      testID={`expense-${expense.id}`}
      accessibilityRole="button"
      accessibilityLabel={[
        expense.description,
        f.date(expense.date),
        category,
        `${t.paidBy} ${payer}`,
        f.money(expense.amount),
        original,
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={() =>
        router.push({
          pathname: '/trips/[id]/expenses/[expenseId]',
          params: { id: tripId, expenseId: expense.id },
        })
      }
      style={({ pressed }) => ({
        minHeight: sizing.touch,
        backgroundColor: pressed ? p.selected : p.surface,
        borderColor: p.border,
        borderLeftWidth: sizing.border,
        borderRightWidth: sizing.border,
        borderTopWidth: sizing.border,
        borderBottomWidth: endOfDay ? sizing.border : 0,
        borderTopLeftRadius: startOfDay ? radius.card : 0,
        borderTopRightRadius: startOfDay ? radius.card : 0,
        borderBottomLeftRadius: endOfDay ? radius.card : 0,
        borderBottomRightRadius: endOfDay ? radius.card : 0,
        paddingHorizontal: spacing.medium,
        paddingVertical: spacing.compact,
        marginBottom: endOfDay ? spacing.large : 0,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.compact,
      })}
    >
      <View style={{ paddingTop: spacing.tiny }}>
        <Icon name={categoryIcon(expense.category)} color={p.muted} />
      </View>
      <View
        testID="expense-row-content"
        onLayout={({ nativeEvent }) =>
          setMeasurement({ viewportWidth, width: nativeEvent.layout.width })
        }
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: horizontal ? 'row' : 'column',
          alignItems: horizontal ? 'flex-start' : 'stretch',
          gap: spacing.small,
        }}
      >
        <View style={{ flex: horizontal ? 3 : undefined, minWidth: 0, gap: spacing.tiny }}>
          <Text style={[typography.body, { color: p.text, fontWeight: '600' }]}>
            {expense.description}
          </Text>
          <Text style={[typography.label, { color: p.muted }]}>
            {category} · {t.paidBy} {payer}
          </Text>
        </View>
        <View
          style={{
            flex: horizontal ? 2 : undefined,
            minWidth: 0,
            gap: spacing.tiny,
          }}
        >
          <Text
            style={[
              typography.body,
              {
                color: p.text,
                fontWeight: '700',
                fontVariant: ['tabular-nums'],
                textAlign: horizontal ? 'right' : 'left',
              },
            ]}
          >
            {f.money(expense.amount)}
          </Text>
          {original && (
            <Text
              style={[
                typography.label,
                { color: p.muted, textAlign: horizontal ? 'right' : 'left' },
              ]}
            >
              {t.originalAmount}: {original}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
