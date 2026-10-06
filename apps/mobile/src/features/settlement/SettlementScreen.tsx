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
import { goBack } from '@/components/navigation';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { memberName } from '@/features/expenses/rows';
import { localDate, money } from '@/i18n/format';
import type { Messages } from '@/i18n/messages';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { useSettlement } from './queries';
import { orderTransfers, viewerBalance } from './view';

type Party = { id: string | null; name: string };

/** The viewer is "You"; a person who no longer resolves keeps a neutral label. */
const partyLabel = ({ id, name }: Party, userId: string | undefined, t: Messages) =>
  id !== null && id === userId ? t.you : memberName(name, t);

function Route({ from, to, userId, t }: { from: Party; to: Party; userId?: string; t: Messages }) {
  const p = usePalette();
  return (
    <Text style={{ color: p.text, fontSize: 18, lineHeight: 26, fontWeight: '600' }}>
      {partyLabel(from, userId, t)} {'→'} {partyLabel(to, userId, t)}
    </Text>
  );
}

function Balances({ settlement, userId }: { settlement: Settlement; userId?: string }) {
  const p = usePalette();
  const t = useMessages();
  return (
    <Card>
      {settlement.balances.map((entry) => (
        <View key={entry.userId} testID={`settlement-balance-${entry.userId}`} style={{ gap: 4 }}>
          <Text style={{ color: p.text, fontSize: 18, lineHeight: 26, fontWeight: '600' }}>
            {entry.userId === userId ? t.you : memberName(entry.displayName, t)}
          </Text>
          <Text style={{ color: p.text, fontSize: 17, lineHeight: 24, fontWeight: '700' }}>
            {entry.balance > 0 ? t.toReceive : entry.balance < 0 ? t.toPay : t.settledShort}{' '}
            {money(Math.abs(entry.balance))}
          </Text>
          <Text style={{ color: p.muted, fontSize: 14, lineHeight: 20 }}>
            {t.paidTotal} {money(entry.totalPaid)} {'·'} {t.owedTotal} {money(entry.totalOwed)}
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
}: {
  settlement: Settlement;
  userId?: string;
  tripId: string;
  online: boolean;
}) {
  const p = usePalette();
  const t = useMessages();
  const mine = viewerBalance(settlement, userId);
  const transfers = orderTransfers(settlement.suggestedTransfers, userId);
  return (
    <>
      {mine !== null && (
        <Metric
          testID="settlement-my-balance"
          label={mine === 0 ? t.balanced : mine > 0 ? t.receivable : t.payable}
          value={money(Math.abs(mine))}
        />
      )}
      <Section title={t.memberBalances}>
        <Balances settlement={settlement} userId={userId} />
      </Section>
      <Section title={t.suggestedTransfers}>
        {transfers.length === 0 ? (
          <Copy>{t.noSuggestedTransfers}</Copy>
        ) : (
          transfers.map((transfer, index) => (
            <Card
              key={`${transfer.fromId}-${transfer.toId}-${index}`}
              testID={`settlement-transfer-${index}`}
              style={{ gap: 8 }}
            >
              <Route
                from={{ id: transfer.fromId, name: transfer.fromName }}
                to={{ id: transfer.toId, name: transfer.toName }}
                userId={userId}
                t={t}
              />
              <Text style={{ color: p.text, fontSize: 20, fontWeight: '700' }}>
                {money(transfer.amount)}
              </Text>
              <Badge label={t.unpaid} />
              <Action
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
      <Section title={t.registeredPayments}>
        {settlement.payments.length === 0 ? (
          <Copy>{t.noPayments}</Copy>
        ) : (
          settlement.payments.map((payment) => (
            <Card key={payment.id} testID={`settlement-payment-${payment.id}`} style={{ gap: 8 }}>
              <Route
                from={{ id: payment.fromId, name: payment.fromName }}
                to={{ id: payment.toId, name: payment.toName }}
                userId={userId}
                t={t}
              />
              <Text style={{ color: p.text, fontSize: 20, fontWeight: '700' }}>
                {money(payment.amount)}
              </Text>
              <Copy>{localDate(new Date(payment.createdAt))}</Copy>
              {!!payment.note && <Copy>{payment.note}</Copy>}
              <Action
                secondary
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
    </>
  );
}

export function SettlementScreen({ tripId }: { tripId: string }) {
  const t = useMessages();
  const p = usePalette();
  const { user } = useAuth();
  const online = useOnline();
  const query = useSettlement(tripId);
  const settlement = query.data;
  // Never leave a previously cached member payload visible after access is denied.
  const denied = isAccessDenied(query.error);
  const status = settlement?.status;
  return (
    <Page>
      <Action
        testID="settlement-back"
        secondary
        label={t.backToTrip}
        onPress={() => goBack({ pathname: '/trips/[id]', params: { id: tripId } })}
      />
      <Title>{t.settlement}</Title>
      <Copy>{t.settlementHint}</Copy>
      {!online && <Notice>{t.offline}</Notice>}
      {query.isPending && online && <ActivityIndicator accessibilityLabel={t.loading} />}
      {query.isError && (
        <>
          <Notice>{settlement && !denied ? t.staleData : errorMessage(query.error, t)}</Notice>
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
          <Card>
            <Text
              testID="settlement-status"
              accessibilityRole="header"
              style={{ color: p.text, fontSize: 20, lineHeight: 28, fontWeight: '700' }}
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
          <Metric
            testID="settlement-total"
            label={t.totalExpenses}
            value={money(settlement.totalExpenses)}
          />
          <Action
            label={t.manualPayment}
            disabled={!online}
            onPress={() =>
              router.push({ pathname: '/trips/[id]/payments/edit', params: { id: tripId } })
            }
          />
          <Details settlement={settlement} userId={user?.id} tripId={tripId} online={online} />
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
