import { goBack } from '@/components/navigation';
import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Action, Copy, DetailRow, Notice, Page } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { errorMessage } from '@/features/auth/errorMessage';
import { useTripEntry } from './provider';
import { PageHeader } from '@/components/screen';
import { RecoveryCard } from '@/components/RecoveryCard';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { useRecoveryDeadline } from '@/features/recovery/useRecoveryDeadline';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import type { PendingMutation } from '@/storage/mutations';
export function OperationsScreen() {
  const { manager, user, status } = useAuth();
  return <ScopedOperationsScreen key={JSON.stringify([manager.api.baseUrl, user?.id, status])} />;
}
function ScopedOperationsScreen() {
  const { entry, scope, records } = useTripEntry();
  const t = useMessages();
  const online = useOnline();
  const { manager, status } = useAuth();
  const { catalog } = useDraftCatalog();
  const format = useDisplayFormat();
  const deadline = useRecoveryDeadline(scope, records.dataUpdatedAt);
  const flight = useRef(false);
  const version = manager.getSignInVersion();
  const current = () =>
    !!scope &&
    manager.getSignInVersion() === version &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === scope.accountId &&
    manager.api.baseUrl === scope.environment;
  const tripOf = (record: PendingMutation) =>
    record.tripId ?? (record.result?.status === 'committed' ? record.result.result.tripId : null);
  const visible = (record: PendingMutation) =>
    current() &&
    record.environment === scope?.environment &&
    record.accountId === scope?.accountId &&
    (!tripOf(record) || catalog.isVisible(record, tripOf(record)!));
  const items = records.isError || records.isPending ? undefined : records.data?.filter(visible);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (record: PendingMutation, action: 'lookup' | 'retry' | 'dismiss') => {
    if (!scope || flight.current || !visible(record)) return;
    if (
      action !== 'dismiss' &&
      (!online || deadline.waiting || deadline.isPending || deadline.isError)
    )
      return;
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'dismiss') await entry.dismiss(scope, record.clientRequestId);
      else {
        const result = await entry[action](scope, record.clientRequestId);
        if (result.kind === 'pending')
          setError(result.error ? errorMessage(result.error, t) : t.operationUnknown);
        if (result.kind === 'blocked') setError(t.operationBlocked);
      }
    } catch (failure) {
      setError(errorMessage(failure, t));
    } finally {
      await Promise.all([records.refetch(), deadline.refetch()]);
      flight.current = false;
      setBusy(false);
    }
  };
  return (
    <Page>
      <PageHeader
        title={t.pendingOperations}
        backLabel={t.backShort}
        backTestID="operations-back"
        onBack={() => goBack('/work')}
      />
      <Copy>{t.pendingSaved}</Copy>
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {status !== 'signedIn' && <Notice tone="warning">{t.sessionExpired}</Notice>}
      {(records.isError || deadline.isError) && (
        <RecoveryCard message={t.recoveryLoadFailed} tone="danger" />
      )}
      {!!error && <Notice tone="warning">{error}</Notice>}
      <Action
        variant="ghost"
        label={records.isError || deadline.isError ? t.retry : t.refresh}
        busy={records.isFetching || deadline.isFetching}
        onPress={() => {
          void records.refetch();
          void deadline.refetch();
        }}
      />
      {deadline.waiting && (
        <RecoveryCard message={t.recoveryWaiting} tone="warning" testID="operations-wait">
          <DetailRow label={t.queueRetryAt} value={format.instant(deadline.until)} />
        </RecoveryCard>
      )}
      {records.isPending && <RecoveryCard message={t.loading} />}
      {items?.length === 0 && (
        <RecoveryCard message={t.operationsEmpty} testID="operations-empty" />
      )}
      {items?.map((record) => (
        <RecoveryCard
          key={record.clientRequestId}
          testID={`operation-${record.clientRequestId}`}
          tone={
            record.status === 'pending'
              ? 'warning'
              : record.result?.status === 'committed'
                ? 'success'
                : 'warning'
          }
          message={
            record.status === 'pending'
              ? t.recoveryUnknown
              : record.result?.status === 'committed'
                ? t.recoveryCompleted
                : t.recoveryRejected
          }
          title={
            record.operation === 'trip.create'
              ? t.createTrip
              : record.operation === 'trip.join'
                ? t.joinTrip
                : record.operation === 'expense.update'
                  ? t.editExpense
                  : record.operation === 'expense.delete'
                    ? t.deleteExpense
                    : record.operation === 'payment.create'
                      ? t.recordPayment
                      : t.revokePayment
          }
        >
          <DetailRow label={t.requestId} value={record.clientRequestId} />
          {record.status === 'pending' ? (
            <>
              <Notice tone="warning">{t.operationUnknown}</Notice>
              {record.conflict && <Notice tone="warning">{t.pendingConflict}</Notice>}
              <Action
                testID={`mutation-check-${record.clientRequestId}`}
                label={t.checkOperation}
                busy={busy}
                disabled={
                  !online ||
                  status !== 'signedIn' ||
                  busy ||
                  deadline.isPending ||
                  deadline.isError ||
                  deadline.waiting
                }
                onPress={() => void run(record, 'lookup')}
              />
              <Action
                testID={`mutation-retry-${record.clientRequestId}`}
                label={t.retryOriginal}
                busy={busy}
                variant="secondary"
                disabled={
                  !online ||
                  status !== 'signedIn' ||
                  busy ||
                  record.conflict ||
                  deadline.isPending ||
                  deadline.isError ||
                  deadline.waiting
                }
                onPress={() => void run(record, 'retry')}
              />
            </>
          ) : (
            <>
              <Notice
                tone={record.result?.status === 'committed' ? 'success' : 'warning'}
                announce="none"
              >
                {record.result?.status === 'committed'
                  ? t.operationDone
                  : record.operation.startsWith('payment.')
                    ? t.paymentChanged
                    : record.operation.startsWith('expense.')
                      ? t.expenseChanged
                      : record.operation === 'trip.join'
                        ? t.operationRejected
                        : t.recoveryRejected}
              </Notice>
              {record.result?.status === 'committed' && (
                <Action
                  testID={`mutation-open-${record.clientRequestId}`}
                  label={t.openTrip}
                  onPress={() => {
                    if (!visible(record)) return;
                    router.push({
                      pathname: '/trips/[id]',
                      params: {
                        id:
                          record.result!.status === 'committed' ? record.result!.result.tripId : '',
                      },
                    });
                  }}
                />
              )}
              {record.result?.status === 'rejected' &&
                record.tripId &&
                record.payload &&
                'expenseId' in record.payload &&
                record.result.code !== 'RESOURCE_GONE' && (
                  <Action
                    testID={`mutation-resume-${record.clientRequestId}`}
                    label={t.resumeExpenseEdit}
                    onPress={() => {
                      if (!visible(record)) return;
                      router.push({
                        pathname: '/trips/[id]/expenses/edit',
                        params: {
                          id: record.tripId!,
                          expenseId: 'expenseId' in record.payload! ? record.payload.expenseId : '',
                          remove: record.operation === 'expense.delete' ? 'true' : 'false',
                          source: record.clientRequestId,
                        },
                      });
                    }}
                  />
                )}
              {record.result?.status === 'rejected' &&
                record.payload?.operation.startsWith('payment.') &&
                record.tripId &&
                record.result.code !== 'RESOURCE_GONE' && (
                  <Action
                    testID={`mutation-resume-${record.clientRequestId}`}
                    label={t.resumePayment}
                    onPress={() => {
                      if (!visible(record)) return;
                      router.push({
                        pathname: '/trips/[id]/payments/edit',
                        params: {
                          id: record.tripId!,
                          source: record.clientRequestId,
                          ...(record.payload?.operation === 'payment.delete'
                            ? { paymentId: record.payload.paymentId }
                            : {}),
                        },
                      });
                    }}
                  />
                )}
              <Action
                variant="ghost"
                label={t.dismissOperation}
                busy={busy}
                onPress={() => void run(record, 'dismiss')}
              />
            </>
          )}
        </RecoveryCard>
      ))}
    </Page>
  );
}
