import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, AppState, FlatList, RefreshControl, View } from 'react-native';
import { ApiError } from '@/api/client';
import { router, useFocusEffect } from 'expo-router';
import { baseCurrency } from '@/api/ledger';
import type { Expense } from '@/api/contracts';
import { ScrollChrome } from '@/components/scrollChrome';
import { ScreenFrame } from '@/components/frame';
import { Action, Notice, Title, styles, usePalette } from '@/components/ui';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { usePendingExpenses } from './entryProvider';
import { useExpenses } from './queries';
import { useTripMembers } from './useTripMembers';
import { uniqueExpenses, createMemberLabelIndex, expenseDayEdges } from './rows';
import { ExpenseListItem } from './ExpenseListItem';
import { MemberRosterNotice } from './MemberRosterNotice';
import { useExpenseBrowse } from './browseProvider';
import { ExpenseSearchControls } from './ExpenseSearchControls';

export function ExpensesScreen({ tripId }: { tripId: string }) {
  const p = usePalette();
  const online = useOnline();
  const { user, manager, status } = useAuth();
  const { catalog } = useDraftCatalog();
  const scope = user ? { environment: manager.api.environment, accountId: user.id } : null;
  const { session, state } = useExpenseBrowse(tripId);
  const searching = session.searching;
  const allowed = !!scope && status === 'signedIn' && catalog.isVisible(scope, tripId);
  const { query, refresh, cancel } = useExpenses(tripId, allowed && !searching);
  const members = useTripMembers(tripId);
  const denied =
    members.denied || isAccessDenied(query.error) || isAccessDenied(state.search.error) || !allowed;
  const data = searching && !denied ? state.search.data : null;
  const t = useMessages(baseCurrency(searching ? data : query.data?.pages[0]));
  const hasPending = (usePendingExpenses(tripId).data?.length ?? 0) > 0;
  const expenses = useMemo(
    () =>
      denied
        ? []
        : uniqueExpenses(searching ? [{ items: data?.items ?? [] }] : (query.data?.pages ?? [])),
    [denied, searching, data, query.data]
  );
  const labels = useMemo(
    () =>
      createMemberLabelIndex(
        members.roster,
        [
          ...expenses.map((e) => ({
            id: e.payerId,
            name: e.payerName,
            isVirtual: e.payerIsVirtual,
          })),
          ...(data?.payers ?? []).map((m) => ({
            id: m.userId,
            name: m.displayName,
            isVirtual: m.isVirtual,
          })),
          ...(data?.summary.members ?? []).map((m) => ({
            id: m.userId,
            name: m.displayName,
            isVirtual: m.isVirtual,
          })),
        ],
        user?.id,
        t
      ),
    [members.roster, expenses, data, user?.id, t]
  );
  const payers = useMemo(
    () => [
      ...new Map(
        [
          ...(members.roster ?? []).map((m) => ({
            userId: m.id,
            displayName: m.displayName,
            isVirtual: m.isVirtual,
          })),
          ...expenses.map((e) => ({
            userId: e.payerId,
            displayName: e.payerName,
            isVirtual: e.payerIsVirtual,
          })),
          ...(data?.payers ?? []),
          { userId: null, displayName: '' },
        ].map((m) => [m.userId, m])
      ).values(),
    ],
    [members.roster, expenses, data]
  );
  const busy = searching ? state.search.busy : query.isFetching;
  const error = searching
    ? state.search.error instanceof ApiError && state.search.error.code === 'CANCELLED'
      ? null
      : state.search.error
    : query.error;
  const list = useRef<FlatList<Expense>>(null);
  const restorePosition = useRef(true);
  const focused = useRef(false);
  const latest = useRef({ query, refresh });
  useEffect(() => {
    latest.current = { query, refresh };
  }, [query, refresh]);
  useEffect(() => {
    if (searching) void cancel();
  }, [searching, cancel]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      session.focus();
      if (online && AppState.currentState === 'active' && !denied) {
        if (session.searching) void session.ensureSearch();
        else if (session.getSnapshot().dirty && !latest.current.query.isFetching) {
          const finish = session.afterRead();
          if (
            !latest.current.query.isStale &&
            !latest.current.query.isError &&
            latest.current.query.data
          )
            finish();
          else
            void latest.current.refresh().then((result) => {
              if (!result.isError) finish();
            });
        }
      }
      return () => {
        focused.current = false;
        session.blur();
        void cancel();
      };
    }, [session, online, denied, cancel])
  );
  // Confirmed writes invalidate both sources. Inactive tabs wait until revisited; a failed read
  // keeps the dirty flag and blocks append rather than joining pages from before/after the write.
  useEffect(() => {
    if (!state.dirty || !online || denied || !focused.current || AppState.currentState !== 'active')
      return;
    if (searching) {
      if (!state.search.error) void session.ensureSearch();
      return;
    }
    if (query.isFetching) return;
    if (!query.isError && query.isStale) {
      const finish = session.afterRead();
      void refresh().then((result) => {
        if (!result.isError) finish();
      });
    } else if (!query.isStale && !query.isError && query.data) session.finishUpdate();
  }, [
    session,
    state.dirty,
    state.search.busy,
    state.search.error,
    online,
    denied,
    searching,
    query.isFetching,
    query.isStale,
    query.isError,
    query.data,
    refresh,
  ]);
  useEffect(() => {
    list.current?.scrollToOffset({ offset: session.offset, animated: false });
  }, [session, state.positionVersion]);
  const refreshAll = async () => {
    if (!online || denied) return;
    if (searching) await Promise.all([session.refreshSearch(), members.refresh()]);
    else {
      const finish = session.afterRead();
      const [result] = await Promise.all([refresh(), members.refresh()]);
      if (!result.isError) finish();
    }
  };
  const retryDenied = () => {
    if (online) {
      void query.refetch();
      void members.refetch();
    }
  };
  return (
    <ScreenFrame>
      <FlatList
        ref={list}
        testID="expenses-list"
        data={expenses}
        keyExtractor={(expense) => expense.id}
        contentOffset={{ x: 0, y: session.offset }}
        onContentSizeChange={() => {
          if (restorePosition.current) {
            list.current?.scrollToOffset({ offset: session.offset, animated: false });
            restorePosition.current = false;
          }
        }}
        onScroll={(event) => {
          if (!restorePosition.current) session.saveOffset(event.nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={100}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.page, { flexGrow: 1, gap: 0 }]}
        refreshControl={
          <RefreshControl
            refreshing={(busy && (searching || !query.isFetchingNextPage)) || members.isFetching}
            onRefresh={() => {
              if (online) void refreshAll();
            }}
            tintColor={p.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 20 }}>
            <ScrollChrome />
            <Title>{t.expenses}</Title>
            {denied ? (
              <>
                <Notice tone="danger">{t.notFound}</Notice>
                <Action
                  testID="expenses-retry"
                  label={t.retry}
                  disabled={!online || busy || members.isFetching}
                  onPress={retryDenied}
                />
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Action
                    testID="expenses-add"
                    label={hasPending ? t.reviewPending : t.addExpense}
                    onPress={() =>
                      router.push({ pathname: '/trips/[id]/expenses/new', params: { id: tripId } })
                    }
                  />
                  <Action
                    testID="expenses-search"
                    variant="ghost"
                    label={t.searchExpenses}
                    expanded={state.tools}
                    onPress={session.tools}
                  />
                  <Action
                    testID="search-analysis"
                    variant="ghost"
                    label={t.searchAnalysis}
                    expanded={state.analysis}
                    disabled={!online && !searching}
                    onPress={() => {
                      if (online || searching) void session.toggleAnalysis();
                    }}
                  />
                </View>
                {hasPending && <Notice tone="warning">{t.pendingExpensesNotice}</Notice>}
                <MemberRosterNotice members={members} online={online} />
                <ExpenseSearchControls
                  session={session}
                  state={state}
                  data={data}
                  labels={labels}
                  payers={payers}
                  online={online}
                  visible={!denied}
                />
                {state.updated && <Notice>{t.expensesUpdated}</Notice>}
                {!!error && (
                  <>
                    <Notice tone={expenses.length ? 'warning' : 'danger'}>
                      {searching && state.search.restart
                        ? t.searchChanged
                        : expenses.length && !searching
                          ? t.staleData
                          : errorMessage(error, t)}
                    </Notice>
                    <Action
                      testID="expenses-retry"
                      label={t.retry}
                      disabled={!online || busy || members.isFetching}
                      onPress={() => void refreshAll()}
                    />
                  </>
                )}
              </>
            )}
            {!online && <Notice tone="warning">{t.offline}</Notice>}
          </View>
        }
        ListEmptyComponent={
          busy || (!searching && query.isPending) ? (
            online ? (
              <ActivityIndicator accessibilityLabel={t.loading} color={p.primary} />
            ) : null
          ) : !query.isError && !error && !denied && !searching ? (
            <View style={{ gap: 16 }}>
              <Title>{t.noExpenses}</Title>
              <Notice>{t.noExpensesHint}</Notice>
              <Action
                testID="expenses-refresh"
                secondary
                label={t.refresh}
                disabled={!online}
                onPress={() => void refreshAll()}
              />
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <ExpenseListItem
            expense={item}
            tripId={tripId}
            labels={labels}
            {...expenseDayEdges(expenses, index)}
          />
        )}
        ListFooterComponent={
          !denied && (searching ? data?.nextCursor : query.hasNextPage) ? (
            <Action
              testID="expenses-load-more"
              secondary
              label={busy ? t.loading : t.loadMoreExpenses}
              busy={busy}
              disabled={!online || state.dirty || (searching && state.search.restart)}
              onPress={() => {
                if (searching) void session.more();
                else void query.fetchNextPage();
              }}
            />
          ) : null
        }
      />
    </ScreenFrame>
  );
}
