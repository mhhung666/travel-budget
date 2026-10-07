import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { ScreenFrame } from '@/components/frame';
import { TripContext } from '@/features/navigation/TripContext';
import { router } from 'expo-router';
import type { Expense } from '@/api/contracts';
import { Action, Copy, Notice, Title, styles, usePalette } from '@/components/ui';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { formatCurrency, money } from '@/i18n/format';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { usePendingExpenses } from './entryProvider';
import { useExpenses } from './queries';
import { isForeign, memberName, uniqueExpenses } from './rows';

function ExpenseRow({ expense, tripId }: { expense: Expense; tripId: string }) {
  const p = usePalette();
  const t = useMessages();
  const payer = memberName(expense.payerName, t);
  const original = isForeign(expense)
    ? formatCurrency(expense.originalAmount, expense.currency)
    : null;
  return (
    <Pressable
      testID={`expense-${expense.id}`}
      accessibilityRole="button"
      accessibilityLabel={[
        expense.description,
        expense.date,
        `${t.paidBy} ${payer}`,
        money(expense.amount),
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
        backgroundColor: p.surface,
        borderColor: p.border,
        borderWidth: 1,
        borderRadius: 18,
        padding: 18,
        marginBottom: 12,
        gap: 6,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: p.text, fontSize: 18, lineHeight: 26, fontWeight: '600' }}>
        {expense.description}
      </Text>
      <Copy>{expense.date}</Copy>
      <Text style={{ color: p.muted, fontSize: 16, lineHeight: 25 }}>
        {t.paidBy} <Text style={{ color: p.text, fontWeight: '600' }}>{payer}</Text>
      </Text>
      <View style={{ borderTopWidth: 1, borderColor: p.border, paddingTop: 10, gap: 2 }}>
        <Text style={{ color: p.text, fontSize: 20, fontWeight: '700' }}>
          {money(expense.amount)}
        </Text>
        {original && <Copy>{original}</Copy>}
      </View>
    </Pressable>
  );
}

export function ExpensesScreen({ tripId }: { tripId: string }) {
  const t = useMessages();
  const p = usePalette();
  const online = useOnline();
  const { query, refresh } = useExpenses(tripId);
  const hasPending = (usePendingExpenses(tripId).data?.length ?? 0) > 0;
  // Never leave a previously cached member payload visible after access is denied.
  const denied = isAccessDenied(query.error);
  const expenses = denied ? [] : uniqueExpenses(query.data?.pages ?? []);
  return (
    <ScreenFrame>
      <FlatList
        testID="expenses-list"
        data={expenses}
        keyExtractor={(expense) => expense.id}
        contentContainerStyle={[styles.page, { flexGrow: 1 }]}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => {
              // Refreshing offline would drop loaded pages without being able to reread them.
              if (online) void refresh();
            }}
            tintColor={p.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 20 }}>
            <TripContext tripId={tripId} />
            <Title>{t.expenses}</Title>
            <Copy>{t.expensesHint}</Copy>
            {hasPending && <Notice tone="warning">{t.pendingExpensesNotice}</Notice>}
            <Action
              testID="expenses-add"
              label={hasPending ? t.reviewPending : t.addExpense}
              onPress={() =>
                router.push({ pathname: '/trips/[id]/expenses/new', params: { id: tripId } })
              }
            />
            {!online && <Notice tone="warning">{t.offline}</Notice>}
            {query.isError && (
              <>
                <Notice tone={query.data && !denied ? 'warning' : 'danger'}>
                  {query.data && !denied ? t.staleData : errorMessage(query.error, t)}
                </Notice>
                <Action
                  testID="expenses-retry"
                  label={t.retry}
                  disabled={!online || query.isFetching}
                  onPress={() => void query.refetch()}
                />
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          query.isPending ? (
            online ? (
              <ActivityIndicator accessibilityLabel={t.loading} color={p.primary} />
            ) : null
          ) : !query.isError ? (
            <View style={{ gap: 16 }}>
              <Title>{t.noExpenses}</Title>
              <Copy>{t.noExpensesHint}</Copy>
              <Action
                testID="expenses-refresh"
                secondary
                label={t.refresh}
                disabled={!online}
                onPress={() => void refresh()}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => <ExpenseRow expense={item} tripId={tripId} />}
        ListFooterComponent={
          query.hasNextPage && !denied ? (
            <Action
              testID="expenses-load-more"
              secondary
              label={query.isFetchingNextPage ? t.loading : t.loadMoreExpenses}
              busy={query.isFetchingNextPage}
              disabled={!online}
              onPress={() => void query.fetchNextPage()}
            />
          ) : null
        }
      />
    </ScreenFrame>
  );
}
