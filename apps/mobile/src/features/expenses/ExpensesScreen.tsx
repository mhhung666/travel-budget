import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { ScreenFrame } from '@/components/frame';
import { TripContext } from '@/features/navigation/TripContext';
import { router } from 'expo-router';
import { Action, Copy, Notice, Title, styles, usePalette } from '@/components/ui';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { usePendingExpenses } from './entryProvider';
import { useExpenses } from './queries';
import { uniqueExpenses } from './rows';
import { ExpenseRow } from './ExpenseRow';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDraftCatalog } from '@/features/localDrafts/provider';

export function ExpensesScreen({ tripId }: { tripId: string }) {
  const t = useMessages();
  const p = usePalette();
  const online = useOnline();
  const { query, refresh } = useExpenses(tripId);
  const hasPending = (usePendingExpenses(tripId).data?.length ?? 0) > 0;
  // Never leave a previously cached member payload visible after access is denied.
  const { user, manager } = useAuth();
  const { catalog } = useDraftCatalog();
  const scope = user ? { environment: manager.api.baseUrl, accountId: user.id } : null;
  const denied = isAccessDenied(query.error) || !scope || !catalog.isVisible(scope, tripId);
  const expenses = denied ? [] : uniqueExpenses(query.data?.pages ?? []);
  const payerPeers = expenses.map((e) => ({ id: e.payerId, name: e.payerName }));
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
          ) : !query.isError && !denied ? (
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
        renderItem={({ item }) => <ExpenseRow expense={item} tripId={tripId} peers={payerPeers} />}
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
