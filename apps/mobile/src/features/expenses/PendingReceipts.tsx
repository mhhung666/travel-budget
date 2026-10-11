import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Action, DetailRow, Notice, Section } from '@/components/ui';
import { RecoveryCard } from '@/components/RecoveryCard';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useMessages } from '@/i18n/useMessages';
import { openReceiptWriteStore } from '@/storage/receiptWriteDatabase';
import type { LocalReceiptWrite } from '@/storage/receiptWrites';
export function PendingReceipts() {
  const { scope } = useTripEntry();
  const t = useMessages();
  const [revision, setRevision] = useState(0);
  const scopeKey = JSON.stringify([scope?.environment, scope?.accountId, revision]);
  const [loaded, setLoaded] = useState<{ key: string; records: LocalReceiptWrite[] } | null>(null);
  const records = loaded?.key === scopeKey ? loaded.records : [];
  const [failed, setFailed] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoaded(null);
      setFailed(false);
      if (scope)
        void openReceiptWriteStore()
          .then((s) => s.list(scope))
          .then((rows) => {
            if (active) setLoaded({ key: scopeKey, records: rows });
          })
          .catch(() => {
            if (active) setFailed(true);
          });
      return () => {
        active = false;
      };
    }, [scope, scopeKey])
  );
  return (
    <Section title={t.receiptPending}>
      {failed && (
        <>
          <Notice tone="danger">{t.queueFailed}</Notice>
          <Action label={t.retry} onPress={() => setRevision((v) => v + 1)} />
        </>
      )}
      {!failed && loaded?.key !== scopeKey && <Notice>{t.loading}</Notice>}
      {!failed && loaded?.key === scopeKey && !records.length && (
        <Notice>{t.operationsEmpty}</Notice>
      )}
      {records.map((r, i) => (
        <RecoveryCard
          key={r.input.client_request_id}
          title={`${t.receipts} ${i + 1}`}
          message={
            r.result?.status === 'committed'
              ? t.receiptSaved
              : r.result?.status === 'rejected'
                ? t.receiptRejected
                : t.receiptPendingHint
          }
          tone={r.result?.status === 'committed' ? 'success' : 'warning'}
        >
          <DetailRow label={t.requestId} value={r.input.client_request_id} />
          <Action
            variant="secondary"
            label={t.receiptManage}
            onPress={() =>
              router.push({
                pathname: '/trips/[id]/expenses/[expenseId]/receipt-write',
                params: { id: r.tripId, expenseId: r.expenseId },
              })
            }
          />
        </RecoveryCard>
      ))}
    </Section>
  );
}
