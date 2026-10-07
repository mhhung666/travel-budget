import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Action, Card, Copy, DetailRow, Notice, Page, Title } from '@/components/ui';
import { useExpenseQueue } from '@/features/expenses/entryProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import type { QueuedExpense } from '@/storage/expenseQueue';

export function QueueScreen() {
  const { manager, user } = useAuth();
  return <ScopedQueueScreen key={JSON.stringify([manager.api.baseUrl, user?.id])} />;
}
function ScopedQueueScreen() {
  const { queue, scope, records, syncFailed } = useExpenseQueue();
  const { status, manager } = useAuth();
  const online = useOnline();
  const t = useMessages();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState<QueuedExpense | null>(null);
  const act = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch {
      setFailed(true);
    } finally {
      await records.refetch();
      setBusy(false);
    }
  };
  const restore = (r: QueuedExpense, discardCurrent = false) =>
    act(async () => {
      try {
        await queue.restore(r, discardCurrent);
      } catch (error) {
        if (error instanceof Error && error.message === 'DRAFT_BLOCKED') setBlocked(r);
        throw error;
      }
      setBlocked(null);
      router.push({ pathname: '/drafts/[id]', params: { id: r.tripId } });
    });
  return (
    <Page>
      <Action secondary label={t.backShort} onPress={() => router.replace('/drafts')} />
      <Title>{t.queueTitle}</Title>
      <Copy>{t.queueHint}</Copy>
      {status === 'local' && (
        <Action
          label={t.restoreOnline}
          disabled={!online || busy}
          onPress={() => void act(() => manager.restore())}
        />
      )}
      <Action
        testID="queue-sync"
        label={t.queueSync}
        busy={busy}
        disabled={!online || status !== 'signedIn' || busy || !scope}
        onPress={() => void act(() => queue.synchronize(scope!))}
      />
      {(records.isError || failed || syncFailed) && <Notice tone="danger">{t.queueFailed}</Notice>}
      {blocked && (
        <>
          <Notice tone="warning">{t.queueDraftExists}</Notice>
          <Action
            label={t.queueReplaceDraft}
            disabled={busy}
            onPress={() => void restore(blocked, true)}
          />
          <Action secondary label={t.backShort} onPress={() => setBlocked(null)} />
        </>
      )}
      {records.isError && <Action label={t.retry} onPress={() => void records.refetch()} />}
      {records.isPending && <ActivityIndicator accessibilityLabel={t.loading} />}
      {records.data?.length === 0 && <Notice>{t.queueEmpty}</Notice>}
      {records.data?.map((r, index) => (
        <Card key={r.clientRequestId} testID={`queue-record-${index}`}>
          <Title>{r.input.description}</Title>
          <DetailRow label={t.amountTwd} value={r.input.amountText} />
          <DetailRow label={t.date} value={r.input.date} />
          <Copy>
            {r.status === 'resolved'
              ? t.queueConflict
              : r.status === 'attention'
                ? t.queueAttention
                : r.status === 'prepared'
                  ? t.queueUnknown
                  : t.queueWaiting}
          </Copy>
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
          {r.nextAt > 0 && (
            <Copy>
              {t.queueRetryAt}: {new Date(r.nextAt).toLocaleString()}
            </Copy>
          )}
          {r.status === 'prepared' ? (
            <Notice tone="warning">{t.queueFrozen}</Notice>
          ) : (
            <>
              {r.status !== 'resolved' && (
                <Action
                  secondary
                  label={t.queueEdit}
                  disabled={busy}
                  onPress={() => void restore(r)}
                />
              )}
              <Action
                secondary
                label={r.status === 'resolved' ? t.queueDismiss : t.queueDiscard}
                disabled={busy}
                onPress={() => void act(() => queue.discard(r))}
              />
            </>
          )}
        </Card>
      ))}
    </Page>
  );
}
