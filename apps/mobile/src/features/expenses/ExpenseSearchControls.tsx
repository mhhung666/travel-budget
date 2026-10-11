import { Keyboard, View } from 'react-native';
import { expenseCategories, type ExpenseSearchResult } from '@travel-budget/contracts';
import { Action, Card, Chip, Copy, DetailRow, Notice, Section, TextField } from '@/components/ui';
import { Disclosure } from '@/components/Disclosure';
import { useMessages } from '@/i18n/useMessages';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { baseCurrency } from '@/api/ledger';
import { categoryLabel, type MemberLabelIndex } from './rows';
import type { ExpenseBrowseSession, BrowseState } from './browse';

export function ExpenseSearchControls({
  session,
  state,
  data,
  labels,
  payers,
  online,
  visible,
}: {
  session: ExpenseBrowseSession;
  state: BrowseState;
  data: ExpenseSearchResult | null;
  labels: MemberLabelIndex;
  payers: ExpenseSearchResult['payers'];
  online: boolean;
  visible: boolean;
}) {
  const t = useMessages(baseCurrency(data));
  const f = useDisplayFormat(baseCurrency(data));
  const { fields, invalid } = state;
  const select = (field: 'category' | 'payerId', value: string | undefined) =>
    session.fields({ ...fields, [field]: value });
  const memberLabel = (m: { userId: string | null; displayName: string; isVirtual?: boolean }) =>
    labels.label({ id: m.userId, name: m.displayName, isVirtual: m.isVirtual });
  const apply = () => {
    if (online && visible) {
      Keyboard.dismiss();
      void session.apply();
    }
  };
  return (
    <>
      {state.tools && (
        <View style={{ gap: 12 }}>
          <TextField
            testID="search-keyword"
            label={t.searchKeyword}
            value={fields.keyword}
            maxLength={200}
            onChangeText={(keyword) => session.fields({ ...fields, keyword })}
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
              {payers.map((m) => (
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
                session.fields({ ...fields, dateFrom: dateFrom || undefined })
              }
            />
            <TextField
              testID="search-date-to"
              label={t.searchTo}
              placeholder="YYYY-MM-DD"
              value={fields.dateTo ?? ''}
              maxLength={10}
              onChangeText={(dateTo) => session.fields({ ...fields, dateTo: dateTo || undefined })}
            />
            <Copy>{t.dateFormatHint}</Copy>
          </Disclosure>
          {invalid && <Notice tone="warning">{t.searchInvalid}</Notice>}
          <Copy>{t.searchAppliedHint}</Copy>
          <Action
            testID="search-apply"
            label={t.searchApply}
            disabled={!online || !visible}
            onPress={() => apply()}
          />
          <Action
            testID="search-reset"
            label={t.searchReset}
            variant="ghost"
            disabled={!visible}
            onPress={() => session.clear()}
          />
        </View>
      )}
      {data && (
        <View style={{ gap: 12 }}>
          <Copy>
            {t.searchFilters}:{' '}
            {[
              state.search.filters.keyword,
              state.search.filters.category ? categoryLabel(state.search.filters.category, t) : '',
              state.search.filters.payerId
                ? memberLabel(
                    payers.find(
                      (m) => (m.userId ?? 'missing') === state.search.filters.payerId
                    ) ?? {
                      userId:
                        state.search.filters.payerId === 'missing'
                          ? null
                          : state.search.filters.payerId,
                      displayName: '',
                    }
                  )
                : '',
              state.search.filters.dateFrom
                ? `${t.searchFrom}: ${f.date(state.search.filters.dateFrom)}`
                : '',
              state.search.filters.dateTo
                ? `${t.searchTo}: ${f.date(state.search.filters.dateTo)}`
                : '',
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
          {state.analysis && (
            <View style={{ gap: 16 }}>
              <Section title={t.category}>
                {data.summary.categories.map((c) => (
                  <Card key={c.category}>
                    <DetailRow label={categoryLabel(c.category, t)} value={f.money(c.total)} />
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
            </View>
          )}
          {data.summary.count === 0 && <Notice>{t.searchEmpty}</Notice>}
        </View>
      )}
    </>
  );
}
