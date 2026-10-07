import { useState } from 'react';
import { Action, Card, Copy, DetailRow, Notice, Section, Title } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { money } from '@/i18n/format';
import type { PendingExpense } from '@/storage/pendingExpenses';
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
  const { entry, scope } = useExpenseEntry();
  const [busy, setBusy] = useState<{ id: string; mode: 'check' | 'retry' } | null>(null);

  const act = async (record: PendingExpense, mode: 'check' | 'retry') => {
    if (busy || !scope) return;
    setBusy({ id: record.clientRequestId, mode });
    try {
      const outcome = await (mode === 'check'
        ? entry.lookup(scope, record.clientRequestId)
        : entry.retry(scope, record.clientRequestId));
      if (outcome.kind === 'saved') onSaved(outcome);
      else if (outcome.kind === 'unconfirmed') onReason(outcome.clientRequestId, outcome.reason);
      else onSettled(outcome);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Title>{t.pendingTitle}</Title>
      <Notice tone="warning">{t.pendingHint}</Notice>
      <Copy>{t.pendingBlocks}</Copy>
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {records.map((record, index) => {
        const reason = reasonMessage(reasons[record.clientRequestId], t);
        const working = busy?.id === record.clientRequestId;
        return (
          <Section key={record.clientRequestId} title={record.payload.description}>
            <Card testID={`pending-card-${index}`}>
              <DetailRow
                testID={`pending-amount-${index}`}
                label={t.amountTwd}
                value={money(record.payload.original_amount)}
              />
              <DetailRow label={t.date} value={record.payload.date} />
              <DetailRow label={t.category} value={categoryLabel(record.payload.category, t)} />
            </Card>
            {!!reason && <Notice tone="warning">{reason}</Notice>}
            <Action
              testID={`pending-check-${index}`}
              label={t.checkResult}
              busy={working && busy?.mode === 'check'}
              disabled={!online || !!busy}
              onPress={() => void act(record, 'check')}
            />
            <Action
              testID={`pending-retry-${index}`}
              secondary
              label={t.retrySame}
              busy={working && busy?.mode === 'retry'}
              disabled={!online || !!busy}
              onPress={() => void act(record, 'retry')}
            />
          </Section>
        );
      })}
    </>
  );
}
