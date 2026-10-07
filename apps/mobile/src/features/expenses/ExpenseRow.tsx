import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Expense } from '@/api/contracts';
import { usePalette } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { useMessages } from '@/i18n/useMessages';
import { radius, sizing, spacing, typography } from '@/theme/tokens';
import { categoryLabel, expenseMemberLabel, isForeign, type ReadMember } from './rows';

export function ExpenseRow({
  expense,
  tripId,
  peers,
}: {
  expense: Expense;
  tripId: string;
  peers: ReadMember[];
}) {
  const p = usePalette();
  const t = useMessages();
  const { user } = useAuth();
  const f = useDisplayFormat();
  const payer = expenseMemberLabel(
    { id: expense.payerId, name: expense.payerName, isVirtual: expense.payerIsVirtual },
    peers,
    user?.id,
    t
  );
  const category = categoryLabel(expense.category, t);
  const original = isForeign(expense)
    ? `${expense.currency} · ${f.currency(expense.originalAmount, expense.currency)}`
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
        borderWidth: sizing.border,
        borderRadius: radius.card,
        padding: spacing.medium,
        marginBottom: spacing.medium,
        gap: spacing.small,
      })}
    >
      <Text style={[typography.body, { color: p.text, fontWeight: '600' }]}>
        {expense.description}
      </Text>
      <Text style={[typography.label, { color: p.muted }]}>{f.date(expense.date)}</Text>
      <Text style={[typography.label, { color: p.muted }]}>
        {category} · {t.paidBy} {payer}
      </Text>
      <View
        style={{
          borderTopWidth: sizing.border,
          borderColor: p.border,
          paddingTop: spacing.small,
          gap: spacing.tiny,
        }}
      >
        <Text
          style={[
            typography.section,
            { color: p.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
          ]}
        >
          {f.money(expense.amount)}
        </Text>
        {original && (
          <Text style={[typography.label, { color: p.muted }]}>
            {t.originalAmount}: {original}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
