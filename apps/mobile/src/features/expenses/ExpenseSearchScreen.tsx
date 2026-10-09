import { useFocusEffect } from 'expo-router';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { FlatList, Keyboard, View } from 'react-native';
import {
  expenseCategories,
  expenseSearchFiltersSchema,
  expenseSearchV2Schema,
  type ExpenseSearchFilters,
} from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { baseCurrency } from '@/api/ledger';
import { ScreenFrame } from '@/components/frame';
import { PageHeader } from '@/components/screen';
import { goBack } from '@/components/navigation';
import {
  Action,
  Card,
  Chip,
  Copy,
  DetailRow,
  Notice,
  Section,
  TextField,
  styles,
} from '@/components/ui';
import { Disclosure } from '@/components/Disclosure';
import { TripContext } from '@/features/navigation/TripContext';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useMessages } from '@/i18n/useMessages';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { useOnline } from '@/providers/useOnline';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { expenseReadGuard, expenseReadWait } from './readGuard';
import { categoryLabel, createMemberLabelIndex } from './rows';
import { ExpenseRow } from './ExpenseRow';
import { emptySearch, ExpenseSearchReader, searchPath } from './search';

export function ExpenseSearchScreen({ tripId }: { tripId: string }) {
  const { manager, scope } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const online = useOnline();
  const [reader] = useState(() => {
    const version = manager.getSignInVersion();
    let unsavedUntil = 0;
    const current = () =>
      !!scope &&
      manager.api.environment === scope.environment &&
      manager.getSignInVersion() === version &&
      manager.getSnapshot().status === 'signedIn' &&
      manager.getSnapshot().user?.id === scope.accountId;
    return new ExpenseSearchReader({
      guard: async () => {
        if (!scope || !current()) throw new ApiError('CANCELLED');
        return expenseReadGuard(manager, catalog, scope, tripId, unsavedUntil);
      },
      read: (filters, cursor, beforeSend, signal) =>
        manager.requestAs(
          scope!.accountId,
          searchPath(tripId, filters, cursor),
          expenseSearchV2Schema,
          { beforeSend, signal }
        ),
      failure: async (error) => {
        if (!scope || !current()) return;
        const wait = expenseReadWait(error);
        if (wait) {
          unsavedUntil = Math.max(unsavedUntil, wait);
          try {
            await (await openMutationStore()).pause(scope, unsavedUntil);
          } catch {
            throw new ApiError('STORAGE');
          }
        }
        if (error instanceof ApiError && error.status === 404 && error.code === 'NOT_FOUND')
          await catalog.deny(scope, tripId);
      },
    });
  });
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
  const visible =
    !!scope &&
    manager.api.environment === scope.environment &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === scope.accountId &&
    catalog.isVisible(scope, tripId);
  const data = visible ? state.data : null;
  const t = useMessages(baseCurrency(data));
  const f = useDisplayFormat(baseCurrency(data));
  const [fields, setFields] = useState<ExpenseSearchFilters>(emptySearch);
  const [invalid, setInvalid] = useState(false);
  useFocusEffect(
    useCallback(() => {
      void reader.refresh();
      return reader.cancel;
    }, [reader])
  );
  const references = [...(data?.payers ?? []), ...(data?.summary.members ?? [])].map((m) => ({
    id: m.userId,
    name: m.displayName,
    isVirtual: m.isVirtual,
  }));
  // No membership assertion: all observed references get stable disambiguation codes.
  const labels = createMemberLabelIndex([], references, scope?.accountId, t);
  function apply(input = fields) {
    const parsed = expenseSearchFiltersSchema.safeParse(input);
    setInvalid(!parsed.success);
    if (parsed.success && online && visible) {
      setFields(parsed.data);
      Keyboard.dismiss();
      void reader.apply(parsed.data);
    }
  }
  const select = (field: 'category' | 'payerId', value: string | undefined) =>
    setFields({ ...fields, [field]: value });
  const memberLabel = (m: { userId: string | null; displayName: string; isVirtual?: boolean }) =>
    labels.label({ id: m.userId, name: m.displayName, isVirtual: m.isVirtual });
  return (
    <ScreenFrame>
      <FlatList
        testID="expense-search-list"
        data={data?.items ?? []}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.page}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <TripContext tripId={tripId} />
            <PageHeader
              title={t.searchExpenses}
              backLabel={t.backShort}
              backTestID="search-back"
              onBack={() => goBack({ pathname: '/trips/[id]/expenses', params: { id: tripId } })}
            />
            <Copy>{t.searchHint}</Copy>
            {!visible && <Notice tone="danger">{t.notFound}</Notice>}
            {!online && <Notice tone="warning">{t.offline}</Notice>}
            {visible && (
              <>
                <TextField
                  testID="search-keyword"
                  label={t.searchKeyword}
                  value={fields.keyword}
                  maxLength={200}
                  onChangeText={(keyword) => setFields({ ...fields, keyword })}
                  returnKeyType="search"
                  onSubmitEditing={() => apply()}
                />
                <Disclosure title={t.searchFilters} testID="search-filters">
                  <Section title={t.category}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      <Chip
                        testID="search-category-all"
                        label={t.searchAll}
                        selected={!fields.category}
                        onPress={() => select('category', undefined)}
                      />
                      {expenseCategories.map((c) => (
                        <Chip
                          key={c}
                          testID={`search-category-${c}`}
                          label={categoryLabel(c, t)}
                          selected={fields.category === c}
                          onPress={() => select('category', c)}
                        />
                      ))}
                    </View>
                  </Section>
                  <Section title={t.paidBy}>
                    <Chip
                      label={t.searchAll}
                      selected={!fields.payerId}
                      onPress={() => select('payerId', undefined)}
                    />
                    {(data?.payers ?? []).map((m) => (
                      <Chip
                        key={m.userId ?? 'missing'}
                        testID={`search-payer-${m.userId ?? 'missing'}`}
                        label={memberLabel(m)}
                        selected={fields.payerId === (m.userId ?? 'missing')}
                        onPress={() => select('payerId', m.userId ?? 'missing')}
                      />
                    ))}
                  </Section>
                  <TextField
                    testID="search-date-from"
                    label={t.searchFrom}
                    placeholder="YYYY-MM-DD"
                    value={fields.dateFrom ?? ''}
                    maxLength={10}
                    onChangeText={(dateFrom) =>
                      setFields({ ...fields, dateFrom: dateFrom || undefined })
                    }
                  />
                  <TextField
                    testID="search-date-to"
                    label={t.searchTo}
                    placeholder="YYYY-MM-DD"
                    value={fields.dateTo ?? ''}
                    maxLength={10}
                    onChangeText={(dateTo) => setFields({ ...fields, dateTo: dateTo || undefined })}
                  />
                  <Copy>{t.dateFormatHint}</Copy>
                </Disclosure>
                {invalid && <Notice tone="warning">{t.searchInvalid}</Notice>}
                <Action
                  testID="search-apply"
                  label={t.searchApply}
                  disabled={!online}
                  onPress={() => apply()}
                />
                <Action
                  testID="search-reset"
                  label={t.searchReset}
                  variant="ghost"
                  disabled={!online}
                  onPress={() => apply(emptySearch)}
                />
                <Copy>{t.searchAppliedHint}</Copy>
                {!!state.error && (
                  <Notice tone="warning">
                    {state.restart ? t.searchChanged : errorMessage(state.error, t)}
                  </Notice>
                )}
                <Action
                  testID="search-refresh"
                  label={t.refresh}
                  busy={state.busy}
                  disabled={!online}
                  onPress={() => void reader.refresh()}
                />
                {data && (
                  <>
                    <Copy>
                      {t.searchFilters}:{' '}
                      {[
                        data.filters.keyword,
                        data.filters.category ? categoryLabel(data.filters.category, t) : '',
                        data.filters.payerId
                          ? memberLabel(
                              data.payers.find(
                                (m) => (m.userId ?? 'missing') === data.filters.payerId
                              ) ?? {
                                userId:
                                  data.filters.payerId === 'missing' ? null : data.filters.payerId,
                                displayName: '',
                              }
                            )
                          : '',
                        data.filters.dateFrom
                          ? `${t.searchFrom}: ${f.date(data.filters.dateFrom)}`
                          : '',
                        data.filters.dateTo ? `${t.searchTo}: ${f.date(data.filters.dateTo)}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ') || t.searchAll}
                    </Copy>
                    <Section title={t.searchSummary}>
                      <Card>
                        <DetailRow label={t.searchCount} value={String(data.summary.count)} />
                        <DetailRow label={t.searchTotal} value={f.money(data.summary.total)} />
                        <DetailRow label={t.mySpent} value={f.money(data.summary.mySpent)} />
                      </Card>
                    </Section>
                    <Disclosure title={t.searchAnalysis} testID="search-analysis">
                      <Section title={t.category}>
                        {data.summary.categories.map((c) => (
                          <Card key={c.category}>
                            <DetailRow
                              label={categoryLabel(c.category, t)}
                              value={f.money(c.total)}
                            />
                            <DetailRow label={t.searchCount} value={String(c.count)} />
                          </Card>
                        ))}
                      </Section>
                      <Section title={t.searchMembers}>
                        {data.summary.members.map((m) => (
                          <Card key={m.userId ?? 'missing'}>
                            <Copy>{memberLabel(m)}</Copy>
                            <DetailRow label={t.searchPaid} value={f.money(m.paid)} />
                            <DetailRow label={t.searchShare} value={f.money(m.share)} />
                          </Card>
                        ))}
                      </Section>
                    </Disclosure>
                    {data.summary.count === 0 && <Notice>{t.searchEmpty}</Notice>}
                  </>
                )}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => <ExpenseRow expense={item} tripId={tripId} labels={labels} />}
        ListFooterComponent={
          data?.nextCursor ? (
            <Action
              testID="search-more"
              label={t.loadMoreExpenses}
              busy={state.busy}
              disabled={!online || state.restart}
              onPress={() => void reader.more()}
            />
          ) : null
        }
      />
    </ScreenFrame>
  );
}
