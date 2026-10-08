import { goBack } from '@/components/navigation';
import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Action, Copy, DetailRow, Notice, Page } from '@/components/ui';
import { useExpenseQueue } from '@/features/expenses/entryProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { PageHeader } from '@/components/screen';
import { RecoveryCard } from '@/components/RecoveryCard';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { useRecoveryDeadline } from '@/features/recovery/useRecoveryDeadline';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { parseAmount } from '@/features/expenses/input';
import { queueRecordVisible } from '@/features/recovery/visibility';
import { queueRetryDeadline } from './presentation';
import type { QueuedExpense } from '@/storage/expenseQueue';

export function QueueScreen() {
  const { manager, user, status } = useAuth();
  return <ScopedQueueScreen key={JSON.stringify([manager.api.environment, user?.id, status])} />;
}
function ScopedQueueScreen() {
  const { queue, scope, records, syncFailed } = useExpenseQueue();
  const { status, manager } = useAuth();
  const online = useOnline();
  const t = useMessages();
  const format = useDisplayFormat();
  const { catalog } = useDraftCatalog();
  const flight = useRef(false);
  const version = manager.getSignInVersion();
  const current = () =>
    !!scope &&
    manager.getSignInVersion() === version &&
    manager.getSnapshot().user?.id === scope.accountId &&
    manager.api.environment === scope.environment;
  const visible = (r: QueuedExpense) => current() && queueRecordVisible(r, scope, catalog);
  const items = records.isError ? undefined : records.data?.filter(visible);
  const deadline = useRecoveryDeadline(
    scope,
    records.dataUpdatedAt,
    items?.reduce((max, r) => Math.max(max, queueRetryDeadline(r, 0)), 0) ?? 0
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState<QueuedExpense | null>(null);
  const act = async (action: () => Promise<unknown>) => {
    if (flight.current || !current()) return;
    flight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch {
      setFailed(true);
    } finally {
      await Promise.all([records.refetch(), deadline.refetch()]);
      flight.current = false;
      setBusy(false);
    }
  };
  const restore = (r: QueuedExpense, discardCurrent = false) =>
    act(async () => {
      if (!visible(r)) return;
      try {
        await queue.restore(r, discardCurrent);
      } catch (error) {
        if (error instanceof Error && error.message === 'DRAFT_BLOCKED') setBlocked(r);
        throw error;
      }
      setBlocked(null);
      if (visible(r)) router.push({ pathname: '/drafts/[id]', params: { id: r.tripId } });
    });
  return (
    <Page>
      <PageHeader title={t.queueTitle} backLabel={t.backShort} onBack={() => goBack('/work')} />
      <Copy>{t.queueHint}</Copy>
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {status === 'local' && (
        <>
          <Notice tone="warning">{t.localSessionHint}</Notice>
          <Action
            label={t.restoreOnline}
            disabled={!online || busy}
            onPress={() => void act(() => manager.restore())}
          />
        </>
      )}
      <Action
        testID="queue-sync"
        label={t.queueSync}
        busy={busy}
        disabled={
          !online ||
          status !== 'signedIn' ||
          busy ||
          !scope ||
          deadline.isPending ||
          deadline.isError ||
          deadline.waiting
        }
        onPress={() => void act(() => queue.synchronize(scope!))}
      />
      {(records.isError || deadline.isError) && (
        <RecoveryCard message={t.recoveryLoadFailed} tone="danger">
          <Action
            label={t.retry}
            onPress={() => {
              void records.refetch();
              void deadline.refetch();
            }}
          />
        </RecoveryCard>
      )}
      {(failed || syncFailed) && <Notice tone="danger">{t.queueFailed}</Notice>}
      {deadline.waiting && (
        <RecoveryCard message={t.recoveryWaiting} tone="warning" testID="queue-wait">
          <DetailRow label={t.queueRetryAt} value={format.instant(deadline.until)} />
        </RecoveryCard>
      )}
      {blocked && visible(blocked) && (
        <>
          <Notice tone="warning">{t.queueDraftExists}</Notice>
          <Action
            variant="danger"
            label={t.queueReplaceDraft}
            disabled={busy}
            onPress={() => void restore(blocked, true)}
          />
          <Action variant="ghost" label={t.cancel} onPress={() => setBlocked(null)} />
        </>
      )}
      {records.isPending && <RecoveryCard message={t.loading} />}
      {items?.length === 0 && <RecoveryCard message={t.queueEmpty} testID="queue-empty" />}
      {items?.map((r, index) => (
        <RecoveryCard
          key={r.clientRequestId}
          testID={`queue-record-${index}`}
          title={r.input.description}
          tone={r.status === 'queued' ? 'info' : 'warning'}
          message={
            r.status === 'resolved'
              ? t.queueConflict
              : r.status === 'attention'
                ? t.queueAttention
                : r.status === 'prepared'
                  ? t.queueUnknown
                  : t.queueWaiting
          }
        >
          <DetailRow label={t.amountTwd} value={queueAmount(r.input.amountText, format.money)} />
          <DetailRow label={t.date} value={format.date(r.input.date)} />
          {!!r.reason && (
            <Notice tone="warning">
              {r.reason === 'members'
                ? t.draftMembersChanged
                : r.reason === 'access'
                  ? t.pendingAccessLost
                  : r.reason === 'unauthorized'
                    ? t.sessionExpired
                    : r.reason === 'conflict'
                      ? t.pendingConflict
                      : r.reason === 'busy'
                        ? t.pendingBusy
                        : t.queuePaused}
            </Notice>
          )}
          {queueRetryDeadline(r, deadline.until) > deadline.now && (
            <DetailRow
              label={t.queueRetryAt}
              value={format.instant(queueRetryDeadline(r, deadline.until))}
            />
          )}
          {r.status === 'prepared' ? (
            <Notice tone="warning">{t.queueFrozen}</Notice>
          ) : (
            <>
              {r.status !== 'resolved' && (
                <Action
                  variant="secondary"
                  label={t.queueEdit}
                  disabled={busy}
                  onPress={() => void restore(r)}
                />
              )}
              <Action
                variant={r.status === 'resolved' ? 'ghost' : 'danger'}
                label={r.status === 'resolved' ? t.queueDismiss : t.queueDiscard}
                disabled={busy}
                onPress={() => {
                  if (visible(r)) void act(() => queue.discard(r));
                }}
              />
            </>
          )}
        </RecoveryCard>
      ))}
    </Page>
  );
}

function queueAmount(text: string, money: (amount: number) => string) {
  const parsed = parseAmount(text);
  return parsed.ok ? money(parsed.amount) : text;
}
