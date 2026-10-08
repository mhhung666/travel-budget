import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Action, Card, Copy, DetailRow, Metric, Notice, Section, Title } from '@/components/ui';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import type { EntryOutcome } from './entry';
import { useExpenseEntry } from './entryProvider';
import { refreshTripData } from './entryQueries';
import { categoryLabel, type MemberLabelIndex, isForeign } from './rows';

type Saved = Extract<EntryOutcome, { kind: 'saved' }>;

/**
 * Shown only once the server has confirmed the expense. If rereading the lists afterwards fails,
 * that is a stale-data notice with a refresh button; the expense is saved and is never re-entered.
 */
export function SavedExpense({
  saved,
  tripId,
  onAnother,
  labels,
}: {
  saved: Saved;
  tripId: string;
  onAnother: () => void;
  labels: MemberLabelIndex;
}) {
  const t = useMessages();
  const f = useDisplayFormat();
  const online = useOnline();
  const client = useQueryClient();
  const { scope } = useExpenseEntry();
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { expense } = saved;
  const payer = { id: expense.payerId, name: expense.payerName, isVirtual: expense.payerIsVirtual };

  useEffect(() => {
    let alive = true;
    void saved.refreshed.then((ok) => alive && setRefreshFailed(!ok));
    return () => {
      alive = false;
    };
  }, [saved]);

  const refresh = async () => {
    if (!scope) return;
    setRefreshing(true);
    try {
      await refreshTripData(client, scope.environment, scope.accountId, tripId);
      setRefreshFailed(false);
    } catch {
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <Title>{t.savedTitle}</Title>
      <Notice tone="success" announce="polite">
        {t.savedHint}
      </Notice>
      {saved.differs && <Notice tone="warning">{t.savedDiffers}</Notice>}
      {refreshFailed && (
        <>
          <Notice tone="warning">{t.savedRefreshFailed}</Notice>
          <Action
            testID="new-expense-refresh"
            label={refreshing ? t.loading : t.refresh}
            busy={refreshing}
            disabled={!online}
            onPress={() => void refresh()}
          />
        </>
      )}
      <Metric testID="saved-amount" label={t.amountTwd} value={f.money(expense.amount)} />
      <Section title={expense.description}>
        <Card testID="new-expense-saved">
          <DetailRow label={t.date} value={f.date(expense.date)} />
          <DetailRow label={t.category} value={categoryLabel(expense.category, t)} />
          <DetailRow label={t.paidBy} value={labels.label(payer)} />
          {isForeign(expense) && (
            <>
              <DetailRow
                label={t.originalAmount}
                value={f.originalAmount(expense.originalAmount, expense.currency)}
              />
              <DetailRow label={t.exchangeRate} value={f.rate(expense.exchangeRate)} />
            </>
          )}
        </Card>
      </Section>
      <Section title={t.splitDetails}>
        <Card>
          {expense.splits.map((split, index) => (
            <DetailRow
              key={`${split.userId ?? 'unknown'}-${index}`}
              testID={`saved-split-${index}`}
              label={labels.label({
                id: split.userId,
                name: split.displayName,
                isVirtual: split.isVirtual,
              })}
              value={f.money(split.shareAmount)}
            />
          ))}
        </Card>
      </Section>
      <Copy>{t.amountsInTwd}</Copy>
      <Action
        testID="new-expense-view"
        label={t.viewExpense}
        onPress={() =>
          router.replace({
            pathname: '/trips/[id]/expenses/[expenseId]',
            params: { id: tripId, expenseId: expense.id },
          })
        }
      />
      <Action testID="new-expense-another" secondary label={t.addAnother} onPress={onAnother} />
      <Action
        testID="new-expense-done"
        secondary
        label={t.backToExpenses}
        onPress={() =>
          router.dismissTo({ pathname: '/trips/[id]/expenses', params: { id: tripId } })
        }
      />
    </>
  );
}
