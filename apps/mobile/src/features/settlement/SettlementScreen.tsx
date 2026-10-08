import { MemberRosterNotice } from '@/features/expenses/MemberRosterNotice';
import { useMemo } from 'react';
import { useTripMembers } from '@/features/expenses/useTripMembers';
import { router } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import type { Settlement } from '@/api/contracts';
import {
  Action,
  Badge,
  Card,
  Copy,
  Metric,
  Notice,
  Page,
  Section,
  Title,
  usePalette,
} from '@/components/ui';
import { TripContext } from '@/features/navigation/TripContext';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import {
  createMemberLabelIndex,
  type MemberLabelIndex,
  type ReadMember,
} from '@/features/expenses/rows';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { spacing, typography } from '@/theme/tokens';
import { localDate } from '@/i18n/format';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { useSettlement } from './queries';
import { orderTransfers, settlementMembers, viewerBalance } from './view';

function Route({
  from,
  to,
  labels,
}: {
  from: ReadMember;
  to: ReadMember;
  labels: MemberLabelIndex;
}) {
  const p = usePalette();
  return (
    <Text style={[typography.body, { color: p.text, fontWeight: '600' }]}>
      {labels.label(from)} {'→'} {labels.label(to)}
    </Text>
  );
}

function Balances({ settlement, labels }: { settlement: Settlement; labels: MemberLabelIndex }) {
  const p = usePalette();
  const t = useMessages();
  const f = useDisplayFormat();
  return (
    <Card>
      {settlement.balances.map((entry) => (
        <View
          key={entry.userId}
          testID={`settlement-balance-${entry.userId}`}
          style={{ gap: spacing.tiny }}
        >
          <Text style={[typography.body, { color: p.text, fontWeight: '600' }]}>
            {labels.label({
              id: entry.userId,
              name: entry.displayName,
              isVirtual: entry.isVirtual,
            })}
          </Text>
          <Text
            style={[
              typography.body,
              { color: p.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
            ]}
          >
            {entry.balance > 0 ? t.toReceive : entry.balance < 0 ? t.toPay : t.settledShort}{' '}
            {f.money(Math.abs(entry.balance))}
          </Text>
          <Text style={[typography.label, { color: p.muted }]}>
            {t.paidTotal} {f.money(entry.totalPaid)} {'·'} {t.owedTotal} {f.money(entry.totalOwed)}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function Details({
  settlement,
  userId,
  tripId,
  online,
  labels,
}: {
  settlement: Settlement;
  userId?: string;
  tripId: string;
  online: boolean;
  labels: MemberLabelIndex;
}) {
  const p = usePalette();
  const t = useMessages();
  const f = useDisplayFormat();
  const transfers = orderTransfers(settlement.suggestedTransfers, userId);
  return (
    <>
      <Section title={t.suggestedTransfers}>
        {transfers.length === 0 ? (
          <Copy>{t.noSuggestedTransfers}</Copy>
        ) : (
          transfers.map((transfer, index) => (
            <Card
              key={`${transfer.fromId}-${transfer.toId}-${index}`}
              testID={`settlement-transfer-${index}`}
              style={{ gap: spacing.small }}
            >
              <Route
                from={{
                  id: transfer.fromId,
                  name: transfer.fromName,
                  isVirtual: transfer.fromIsVirtual,
                }}
                to={{ id: transfer.toId, name: transfer.toName, isVirtual: transfer.toIsVirtual }}
                labels={labels}
              />
              <Text
                style={[
                  typography.section,
                  { color: p.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
                ]}
              >
                {f.money(transfer.amount)}
              </Text>
              <Badge label={t.unpaid} />
              <Action
                testID="settlement-record-payment"
                label={t.recordPayment}
                disabled={!online}
                onPress={() =>
                  router.push({
                    pathname: '/trips/[id]/payments/edit',
                    params: {
                      id: tripId,
                      from: transfer.fromId,
                      to: transfer.toId,
                      amount: String(transfer.amount),
                    },
                  })
                }
              />
            </Card>
          ))
        )}
      </Section>
      <Action
        testID="settlement-manual-payment"
        variant="secondary"
        label={t.manualPayment}
        disabled={!online}
        onPress={() =>
          router.push({ pathname: '/trips/[id]/payments/edit', params: { id: tripId } })
        }
      />
      <Section title={t.registeredPayments}>
        {settlement.payments.length === 0 ? (
          <Copy>{t.noPayments}</Copy>
        ) : (
          settlement.payments.map((payment) => (
            <Card
              key={payment.id}
              testID={`settlement-payment-${payment.id}`}
              style={{ gap: spacing.small }}
            >
              <Route
                from={{
                  id: payment.fromId,
                  name: payment.fromName,
                  isVirtual: payment.fromIsVirtual,
                }}
                to={{ id: payment.toId, name: payment.toName, isVirtual: payment.toIsVirtual }}
                labels={labels}
              />
              <Text
                style={[
                  typography.section,
                  { color: p.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
                ]}
              >
                {f.money(payment.amount)}
              </Text>
              <Copy>{f.date(localDate(new Date(payment.createdAt)))}</Copy>
              {!!payment.note && <Copy>{payment.note}</Copy>}
              <Action
                variant="danger"
                testID={`payment-revoke-${payment.id}`}
                label={t.revokePayment}
                disabled={!online}
                onPress={() =>
                  router.push({
                    pathname: '/trips/[id]/payments/edit',
                    params: { id: tripId, paymentId: payment.id },
                  })
                }
              />
            </Card>
          ))
        )}
      </Section>
      <Section title={t.memberBalances}>
        <Balances settlement={settlement} labels={labels} />
      </Section>
      <Metric
        testID="settlement-total"
        label={t.totalExpenses}
        value={f.money(settlement.totalExpenses)}
      />
    </>
  );
}

export function SettlementScreen({ tripId }: { tripId: string }) {
  const t = useMessages();
  const p = usePalette();
  const f = useDisplayFormat();
  const { user, manager } = useAuth();
  const { catalog } = useDraftCatalog();
  const scope = user ? { environment: manager.api.baseUrl, accountId: user.id } : null;
  const online = useOnline();
  const query = useSettlement(tripId);
  const settlement = query.data;
  // Never leave a previously cached member payload visible after access is denied.
  const members = useTripMembers(tripId);
  const denied =
    members.denied || isAccessDenied(query.error) || !scope || !catalog.isVisible(scope, tripId);
  const labels = useMemo(
    () =>
      createMemberLabelIndex(
        members.roster,
        settlement ? settlementMembers(settlement) : [],
        user?.id,
        t
      ),
    [members.roster, settlement, user?.id, t]
  );
  const mine = settlement ? viewerBalance(settlement, user?.id) : null;
  const status = settlement?.status;
  return (
    <Page>
      <TripContext tripId={tripId} />
      <Title>{t.settlement}</Title>
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      <MemberRosterNotice members={members} online={online} />
      {query.isPending && online && <ActivityIndicator accessibilityLabel={t.loading} />}
      {query.isError && (
        <>
          <Notice tone={settlement && !denied ? 'warning' : 'danger'}>
            {settlement && !denied ? t.staleData : errorMessage(query.error, t)}
          </Notice>
          <Action
            testID="settlement-retry"
            label={t.retry}
            disabled={!online || query.isFetching}
            onPress={() => void query.refetch()}
          />
        </>
      )}
      {settlement && !denied && (
        <>
          {mine !== null && (
            <Metric
              testID="settlement-my-balance"
              label={mine === 0 ? t.balanced : mine > 0 ? t.receivable : t.payable}
              value={f.money(Math.abs(mine))}
            />
          )}
          <Card>
            <Text
              testID="settlement-status"
              accessibilityRole="header"
              style={[typography.section, { color: p.text, fontWeight: '700' }]}
            >
              {status === 'empty'
                ? t.settlementEmpty
                : status === 'settled'
                  ? t.settlementSettled
                  : t.settlementOutstanding}
            </Text>
            {status !== 'outstanding' && (
              <Copy>{status === 'empty' ? t.settlementEmptyHint : t.settlementSettledHint}</Copy>
            )}
          </Card>
          <Copy>{t.settlementHint}</Copy>
          <Details
            labels={labels}
            settlement={settlement}
            userId={user?.id}
            tripId={tripId}
            online={online}
          />
          <Copy>{t.amountsInTwd}</Copy>
          <Action
            testID="settlement-refresh"
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
