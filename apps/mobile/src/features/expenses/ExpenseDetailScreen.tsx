import { MemberRosterNotice } from '@/features/expenses/MemberRosterNotice';
import { useMemo } from 'react';
import { useTripMembers } from './useTripMembers';
import { PageHeader } from '@/components/screen';
import { TripContext } from '@/features/navigation/TripContext';
import { ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Action, Card, Copy, DetailRow, Notice, Page, Section, Title } from '@/components/ui';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { useExpense } from './queries';
import {
  categoryLabel,
  isForeign,
  createMemberLabelIndex,
  expenseMembers,
  type ReadMember,
} from './rows';

export function ExpenseDetailScreen({ tripId, expenseId }: { tripId: string; expenseId: string }) {
  const t = useMessages();
  const f = useDisplayFormat();
  const { user, manager } = useAuth();
  const { catalog } = useDraftCatalog();
  const scope = user ? { environment: manager.api.baseUrl, accountId: user.id } : null;
  const online = useOnline();
  const query = useExpense(tripId, expenseId);
  const expense = query.data;
  // Never leave a previously cached member payload visible after access is denied.
  const members = useTripMembers(tripId);
  const denied =
    members.denied || isAccessDenied(query.error) || !scope || !catalog.isVisible(scope, tripId);
  const payer: ReadMember = {
    id: expense?.payerId ?? null,
    name: expense?.payerName ?? '',
    isVirtual: expense?.payerIsVirtual,
  };
  const labels = useMemo(
    () =>
      createMemberLabelIndex(members.roster, expense ? expenseMembers(expense) : [], user?.id, t),
    [members.roster, expense, user?.id, t]
  );
  return (
    <Page>
      <PageHeader
        backTestID="expense-back"
        backLabel={t.backToExpenses}
        onBack={() =>
          router.dismissTo({ pathname: '/trips/[id]/expenses', params: { id: tripId } })
        }
      />
      <TripContext tripId={tripId} />
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      <MemberRosterNotice members={members} online={online} />
      {query.isPending && online && <ActivityIndicator accessibilityLabel={t.loading} />}
      {query.isError && (
        <>
          <Notice tone={expense && !denied ? 'warning' : 'danger'}>
            {expense && !denied
              ? t.staleData
              : denied
                ? t.expenseUnavailable
                : errorMessage(query.error, t)}
          </Notice>
          <Action
            testID="expense-retry"
            label={t.retry}
            disabled={!online || query.isFetching}
            onPress={() => void query.refetch()}
          />
        </>
      )}
      {expense && !denied && (
        <>
          <Title>{expense.description}</Title>
          <Card>
            <DetailRow
              testID="expense-amount"
              label={t.amountTwd}
              value={f.money(expense.amount)}
            />
            <DetailRow testID="expense-date" label={t.date} value={f.date(expense.date)} />
            <DetailRow
              testID="expense-category"
              label={t.category}
              value={categoryLabel(expense.category, t)}
            />
            <DetailRow testID="expense-payer" label={t.paidBy} value={labels.label(payer)} />
            {isForeign(expense) && (
              <>
                <DetailRow
                  testID="expense-original"
                  label={t.originalAmount}
                  value={f.originalAmount(expense.originalAmount, expense.currency)}
                />
                <DetailRow
                  testID="expense-rate"
                  label={t.exchangeRate}
                  value={f.rate(expense.exchangeRate)}
                />
              </>
            )}
          </Card>
          <Section title={t.splitDetails}>
            {expense.splits.length === 0 ? (
              <Copy>{t.noSplits}</Copy>
            ) : (
              <Card>
                {expense.splits.map((split, index) => (
                  <DetailRow
                    key={`${split.userId ?? 'unknown'}-${index}`}
                    testID={`expense-split-${index}`}
                    label={labels.label({
                      id: split.userId,
                      name: split.displayName,
                      isVirtual: split.isVirtual,
                    })}
                    value={f.money(split.shareAmount)}
                  />
                ))}
              </Card>
            )}
          </Section>
          <Copy>{t.amountsInTwd}</Copy>
          <Action
            testID="expense-edit"
            variant="secondary"
            label={t.editExpense}
            disabled={!online}
            onPress={() =>
              router.push({
                pathname: '/trips/[id]/expenses/edit',
                params: { id: tripId, expenseId },
              })
            }
          />
          <Action
            testID="expense-delete"
            variant="danger"
            label={t.deleteExpense}
            disabled={!online}
            onPress={() =>
              router.push({
                pathname: '/trips/[id]/expenses/edit',
                params: { id: tripId, expenseId, remove: 'true' },
              })
            }
          />
          <Action
            testID="expense-refresh"
            secondary
            label={query.isFetching ? t.loading : t.refresh}
            busy={query.isFetching}
            disabled={!online}
            onPress={() => void query.refetch()}
          />
        </>
      )}
    </Page>
  );
}
