import { useState } from 'react';
import { router } from 'expo-router';
import { Action, Card, Copy, Notice, Page, Title } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { errorMessage } from '@/features/auth/errorMessage';
import { useTripEntry } from './provider';
import type { PendingMutation } from '@/storage/mutations';
export function OperationsScreen() {
  const { entry, scope, records } = useTripEntry();
  const t = useMessages();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (record: PendingMutation, action: 'lookup' | 'retry' | 'dismiss') => {
    if (!scope || busy) return;
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
      setBusy(false);
    }
  };
  return (
    <Page>
      <Action secondary label={t.back} onPress={() => router.replace('/trips')} />
      <Title>{t.pendingOperations}</Title>
      <Notice>{t.pendingSaved}</Notice>
      {records.isError && <Notice>{errorMessage(records.error, t)}</Notice>}
      {!!error && <Notice>{error}</Notice>}
      <Action
        secondary
        label={t.refresh}
        busy={records.isFetching}
        onPress={() => void records.refetch()}
      />
      {records.data?.map((record) => (
        <Card key={record.clientRequestId}>
          <Title>
            {record.operation === 'trip.create'
              ? t.createTrip
              : record.operation === 'trip.join'
                ? t.joinTrip
                : record.operation === 'expense.update'
                  ? t.editExpense
                  : record.operation === 'expense.delete'
                    ? t.deleteExpense
                    : record.operation === 'payment.create'
                      ? t.recordPayment
                      : t.revokePayment}
          </Title>
          <Copy>{record.clientRequestId}</Copy>
          {record.status === 'pending' ? (
            <>
              <Notice>{t.operationUnknown}</Notice>
              {record.conflict && <Notice>{t.operationBlocked}</Notice>}
              <Action
                label={t.checkOperation}
                busy={busy}
                disabled={!online}
                onPress={() => void run(record, 'lookup')}
              />
              <Action
                label={t.retryOriginal}
                busy={busy}
                disabled={!online || record.conflict}
                onPress={() => void run(record, 'retry')}
              />
            </>
          ) : (
            <>
              <Notice>
                {record.result?.status === 'committed'
                  ? t.operationDone
                  : record.operation.startsWith('payment.')
                    ? t.paymentChanged
                    : record.operation.startsWith('expense.')
                      ? t.expenseChanged
                      : t.operationRejected}
              </Notice>
              {record.result?.status === 'committed' && (
                <Action
                  label={t.openTrip}
                  onPress={() =>
                    router.push({
                      pathname: '/trips/[id]',
                      params: {
                        id:
                          record.result!.status === 'committed' ? record.result!.result.tripId : '',
                      },
                    })
                  }
                />
              )}
              {record.result?.status === 'rejected' &&
                record.tripId &&
                record.payload &&
                'expenseId' in record.payload &&
                record.result.code !== 'RESOURCE_GONE' && (
                  <Action
                    label={t.resumeExpenseEdit}
                    onPress={() =>
                      router.push({
                        pathname: '/trips/[id]/expenses/edit',
                        params: {
                          id: record.tripId!,
                          expenseId: 'expenseId' in record.payload! ? record.payload.expenseId : '',
                          remove: record.operation === 'expense.delete' ? 'true' : 'false',
                          source: record.clientRequestId,
                        },
                      })
                    }
                  />
                )}
              {record.result?.status === 'rejected' &&
                record.payload?.operation.startsWith('payment.') &&
                record.tripId &&
                record.result.code !== 'RESOURCE_GONE' && (
                  <Action
                    label={t.resumePayment}
                    onPress={() =>
                      router.push({
                        pathname: '/trips/[id]/payments/edit',
                        params: {
                          id: record.tripId!,
                          source: record.clientRequestId,
                          ...(record.payload?.operation === 'payment.delete'
                            ? { paymentId: record.payload.paymentId }
                            : {}),
                        },
                      })
                    }
                  />
                )}
              <Action
                secondary
                label={t.dismissOperation}
                busy={busy}
                onPress={() => void run(record, 'dismiss')}
              />
            </>
          )}
        </Card>
      ))}
    </Page>
  );
}
