import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Action, Card, Copy, DetailRow, Notice, Section, Title } from '@/components/ui';
import { goBack } from '@/components/navigation';
import { money } from '@/i18n/format';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import type { EntryOutcome } from './entry';
import { useExpenseEntry } from './entryProvider';
import { refreshTripData } from './entryQueries';
import { categoryLabel, memberName } from './rows';

type Saved = Extract<EntryOutcome, { kind: 'saved' }>;

/**
 * Shown only once the server has confirmed the expense. If rereading the lists afterwards fails,
 * that is a stale-data notice with a refresh button; the expense is saved and is never re-entered.
 */
export function SavedExpense({
  saved,
  tripId,
  onAnother,
}: {
  saved: Saved;
  tripId: string;
  onAnother: () => void;
}) {
  const t = useMessages();
  const online = useOnline();
  const client = useQueryClient();
  const { scope } = useExpenseEntry();
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { expense } = saved;

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
      <Notice>{t.savedHint}</Notice>
      {saved.differs && <Notice>{t.savedDiffers}</Notice>}
      {refreshFailed && (
        <>
          <Notice>{t.savedRefreshFailed}</Notice>
          <Action
            testID="new-expense-refresh"
            label={refreshing ? t.loading : t.refresh}
            busy={refreshing}
            disabled={!online}
            onPress={() => void refresh()}
          />
        </>
      )}
      <Section title={expense.description}>
        <Card testID="new-expense-saved">
          <DetailRow testID="saved-amount" label={t.amountTwd} value={money(expense.amount)} />
          <DetailRow label={t.date} value={expense.date} />
          <DetailRow label={t.category} value={categoryLabel(expense.category, t)} />
          <DetailRow label={t.paidBy} value={memberName(expense.payerName, t)} />
        </Card>
      </Section>
      <Section title={t.splitDetails}>
        <Card>
          {expense.splits.map((split, index) => (
            <DetailRow
              key={`${split.userId ?? 'unknown'}-${index}`}
              testID={`saved-split-${index}`}
              label={memberName(split.displayName, t)}
              value={money(split.shareAmount)}
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
        onPress={() => goBack({ pathname: '/trips/[id]/expenses', params: { id: tripId } })}
      />
    </>
  );
}
