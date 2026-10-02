'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useExpenseOutbox } from '@/hooks/useExpenseOutbox';
import { useExpenseMutations } from '@/hooks/queries/useExpenseMutations';
import { useMembers, useCurrentUser } from '@/hooks/queries/useTripQueries';
import { saveExpenseOutbox, type ExpenseOutboxEntry } from '@/lib/expenseOutbox';
import { buildOptimisticExpense } from '@/lib/optimisticExpense';
import { ExpenseFormSheet } from '@/components/trips/DeferredDialogs';
import { ResponsiveFormSheet } from '@/components/common/ResponsiveFormSheet';
import { QueryStatus } from '@/components/common/QueryStatus';
import { Button } from '@/components/ui/button';

function download(entry: ExpenseOutboxEntry) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(entry.vars.input, null, 2)], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `expense-draft-${entry.vars.input.client_request_id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function EditDraft({ entry, onClose }: { entry: ExpenseOutboxEntry; onClose: () => void }) {
  const members = useMembers(entry.vars.tripId);
  const user = useCurrentUser();
  const { create } = useExpenseMutations(entry.vars.tripId);
  const t = useTranslations('offline');
  const expense = useMemo(
    () =>
      buildOptimisticExpense(entry.vars.input, {
        tripId: entry.vars.tripId,
        id: 'draft',
        members: [],
        createdAt: new Date(entry.createdAt).toISOString(),
      }),
    [entry]
  );
  if (!members.data?.length || !user.data)
    return (
      <ResponsiveFormSheet
        open
        onOpenChange={(open) => !open && onClose()}
        title={t('draftsTitle')}
      >
        <p>{t('draftAccessMessage')}</p>
        <QueryStatus query={members} />
        <QueryStatus query={user} />
        <Button onClick={() => download(entry)}>{t('exportDraft')}</Button>
      </ResponsiveFormSheet>
    );
  return (
    <ExpenseFormSheet
      mode="add"
      tripId={entry.vars.tripId}
      open
      onClose={onClose}
      members={members.data}
      currentUser={user.data}
      expense={expense}
      onSubmit={async (data) => {
        await create.enqueue({
          tripId: entry.vars.tripId,
          replacesRequestId: entry.vars.input.client_request_id,
          input: {
            ...data,
            original_amount: Number(data.original_amount),
            exchange_rate: Number(data.exchange_rate),
          },
        });
        onClose();
      }}
    />
  );
}

/** Global access keeps rejected input recoverable even after trip membership is revoked. */
export function ExpenseDraftRecovery() {
  const { data = {} } = useExpenseOutbox();
  const client = useQueryClient();
  const t = useTranslations('offline');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseOutboxEntry>();
  const [error, setError] = useState('');
  const failed = Object.values(data).filter((entry) => entry.status !== 'done');
  if (!failed.length && !editing) return null;
  return (
    <>
      <div
        role="status"
        className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2 text-sm"
      >
        <span>{t('draftsMessage', { count: failed.length })}</span>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {t('reviewDrafts')}
        </Button>
      </div>
      <ResponsiveFormSheet open={open && !editing} onOpenChange={setOpen} title={t('draftsTitle')}>
        {error && <p role="alert">{error}</p>}
        <ul className="space-y-4">
          {failed.map((entry) => (
            <li
              key={entry.vars.input.client_request_id}
              className="space-y-2 rounded-lg border p-3"
            >
              <p className="font-medium">
                {entry.vars.input.description} · {entry.vars.input.currency}{' '}
                {entry.vars.input.original_amount}
              </p>
              <p className="text-sm text-muted-foreground">{entry.error ?? t('pending')}</p>
              <div className="flex flex-wrap gap-2">
                {entry.status === 'failed' && (
                  <Button onClick={() => setEditing(entry)}>{t('editDraft')}</Button>
                )}
                <Button variant="outline" onClick={() => download(entry)}>
                  {t('exportDraft')}
                </Button>
                <Button
                  disabled={entry.status !== 'failed'}
                  variant="ghost"
                  onClick={async () => {
                    if (!window.confirm(t('discardDraftConfirm'))) return;
                    try {
                      await saveExpenseOutbox(client, entry.vars, entry.context, 'done');
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err));
                    }
                  }}
                >
                  {t('discardDraft')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </ResponsiveFormSheet>
      {editing && (
        <EditDraft
          entry={editing}
          onClose={() => {
            setEditing(undefined);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
