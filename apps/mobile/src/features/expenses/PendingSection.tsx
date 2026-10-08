import { useRef, useState } from 'react';
import { Action, Copy, DetailRow, Notice, Section } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { RecoveryCard } from '@/components/RecoveryCard';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { useRecoveryDeadline } from '@/features/recovery/useRecoveryDeadline';
import type { PendingExpense } from '@/storage/pendingExpenses';
import { retiredExpense } from '@/api/recovery';
import { useOnline } from '@/providers/useOnline';
import { categoryLabel } from './rows';
import { reasonMessage } from './entryMessages';
import type { EntryOutcome, UnconfirmedReason } from './entry';
import { useExpenseEntry } from './entryProvider';

type Saved = Extract<EntryOutcome, { kind: 'saved' }>;

/**
 * Requests that were sent but never answered. They cannot be edited or replaced: the only moves are
 * asking the server what it has and repeating the identical request, so nothing can be recorded
 * twice. New expenses for the trip wait until these are settled.
 */
export function PendingSection({
  records,
  reasons,
  onSaved,
  onReason,
  onSettled,
}: {
  records: PendingExpense[];
  reasons: Record<string, UnconfirmedReason>;
  onSaved: (saved: Saved) => void;
  onReason: (clientRequestId: string, reason: UnconfirmedReason) => void;
  /** The request was rejected or is gone; the list of pending requests needs rereading. */
  onSettled: (outcome: EntryOutcome) => void;
}) {
  const t = useMessages();
  const online = useOnline();
  const format = useDisplayFormat();
  const { status, manager } = useAuth();
  const { catalog } = useDraftCatalog();
  const { entry, scope } = useExpenseEntry();
  const deadline = useRecoveryDeadline(scope, records);
  const flight = useRef(false);
  const version = manager.getSignInVersion();
  const current = () =>
    !!scope &&
    manager.getSignInVersion() === version &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === scope.accountId &&
    manager.api.environment === scope.environment;
  const visible = (record: PendingExpense) =>
    current() &&
    record.environment === scope?.environment &&
    record.accountId === scope?.accountId &&
    catalog.isVisible(record, record.tripId);
  const [busy, setBusy] = useState<{ id: string; mode: 'check' | 'retry' | 'discard' } | null>(
    null
  );
  const [discardFailed, setDiscardFailed] = useState(false);

  /** Only a retired v1 request can be discarded; it needs no connection, since nothing is sent. */
  const discard = async (record: PendingExpense) => {
    if (flight.current || !scope || !visible(record)) return;
    flight.current = true;
    setBusy({ id: record.clientRequestId, mode: 'discard' });
    setDiscardFailed(false);
    try {
      await entry.abandon(scope, record.clientRequestId);
      if (visible(record)) onSettled({ kind: 'gone' });
    } catch {
      setDiscardFailed(true);
    } finally {
      flight.current = false;
      setBusy(null);
    }
  };

  const act = async (record: PendingExpense, mode: 'check' | 'retry') => {
    if (
      flight.current ||
      !scope ||
      !visible(record) ||
      !online ||
      deadline.waiting ||
      deadline.isPending ||
      deadline.isError
    )
      return;
    flight.current = true;
    setBusy({ id: record.clientRequestId, mode });
    try {
      const outcome = await (mode === 'check'
        ? entry.lookup(scope, record.clientRequestId)
        : entry.retry(scope, record.clientRequestId));
      if (!visible(record)) return;
      if (outcome.kind === 'saved') onSaved(outcome);
      else if (outcome.kind === 'unconfirmed') onReason(outcome.clientRequestId, outcome.reason);
      else onSettled(outcome);
    } finally {
      await deadline.refetch();
      flight.current = false;
      setBusy(null);
    }
  };

  return (
    <>
      <Section title={t.pendingTitle}>
        <Notice tone="warning" announce="none">
          {t.pendingHint}
        </Notice>
        <Copy>{t.pendingBlocks}</Copy>
        {!online && <Notice tone="warning">{t.offline}</Notice>}
        {discardFailed && <Notice tone="danger">{t.genericError}</Notice>}
        {status !== 'signedIn' && <Notice tone="warning">{t.sessionExpired}</Notice>}
        {deadline.isError && (
          <RecoveryCard message={t.recoveryLoadFailed} tone="danger">
            <Action label={t.retry} onPress={() => void deadline.refetch()} />
          </RecoveryCard>
        )}
        {deadline.waiting && (
          <RecoveryCard message={t.recoveryWaiting} tone="warning" testID="pending-wait">
            <DetailRow label={t.queueRetryAt} value={format.instant(deadline.until)} />
          </RecoveryCard>
        )}
        {records.filter(visible).map((record, index) => {
          const retired = retiredExpense(record);
          const reason = reasonMessage(retired ? 'retired' : reasons[record.clientRequestId], t);
          const working = busy?.id === record.clientRequestId;
          return (
            <RecoveryCard
              key={record.clientRequestId}
              title={record.payload.description}
              testID={`pending-card-${index}`}
              message={t.recoveryUnknown}
              tone="warning"
            >
              <DetailRow
                testID={`pending-amount-${index}`}
                label={t.amountTwd.replace(
                  'TWD',
                  'base_currency' in record.payload ? record.payload.base_currency : 'TWD'
                )}
                value={format.money(
                  record.payload.splits.reduce(
                    (sum, s) => sum + Math.round(s.share_amount * 100),
                    0
                  ) / 100,
                  'base_currency' in record.payload ? record.payload.base_currency : 'TWD'
                )}
              />
              {record.payload.currency !==
                ('base_currency' in record.payload ? record.payload.base_currency : 'TWD') && (
                <>
                  <DetailRow
                    label={t.originalAmount}
                    value={format.originalAmount(
                      record.payload.original_amount,
                      record.payload.currency
                    )}
                  />
                  <DetailRow label={t.exchangeRate} value={String(record.payload.exchange_rate)} />
                </>
              )}
              <DetailRow label={t.date} value={format.date(record.payload.date)} />
              <DetailRow label={t.category} value={categoryLabel(record.payload.category, t)} />

              {!!reason && <Notice tone="warning">{reason}</Notice>}
              {retired ? (
                <Action
                  testID={`pending-discard-${index}`}
                  variant="danger"
                  label={t.discardRetired}
                  busy={working && busy?.mode === 'discard'}
                  disabled={!!busy}
                  onPress={() => void discard(record)}
                />
              ) : (
                <>
                  <Action
                    testID={`pending-check-${index}`}
                    label={t.checkResult}
                    busy={working && busy?.mode === 'check'}
                    disabled={
                      !online ||
                      status !== 'signedIn' ||
                      !!busy ||
                      deadline.isPending ||
                      deadline.isError ||
                      deadline.waiting
                    }
                    onPress={() => void act(record, 'check')}
                  />
                  <Action
                    testID={`pending-retry-${index}`}
                    variant="secondary"
                    label={t.retrySame}
                    busy={working && busy?.mode === 'retry'}
                    disabled={
                      !online ||
                      status !== 'signedIn' ||
                      !!busy ||
                      deadline.isPending ||
                      deadline.isError ||
                      deadline.waiting
                    }
                    onPress={() => void act(record, 'retry')}
                  />
                </>
              )}
            </RecoveryCard>
          );
        })}
      </Section>
    </>
  );
}
