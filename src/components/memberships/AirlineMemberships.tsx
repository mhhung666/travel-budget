'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Medal, Plus } from 'lucide-react';

import { LOYALTY_PROGRAMS, type LoyaltyProgram } from '@/constants/loyalty';
import { useLoyalty, useLoyaltyMutations } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import type { LoyaltyAccountItem, LoyaltyEntryItem } from '@/types';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, EmptyState, LoadingState } from '@/components/common';
import { LoyaltyAccountDialog, LoyaltyEntryDialog } from '@/components/collections';
import { ProgramProgressCard } from './ProgramProgressCard';
import { LoyaltyLedger } from './LoyaltyLedger';

type AccountDialogState = {
  open: boolean;
  program: LoyaltyProgram;
  editing: LoyaltyAccountItem | null;
};
type EntryDialogState = {
  open: boolean;
  program: LoyaltyProgram;
  editing: LoyaltyEntryItem | null;
};

/**
 * 航空會籍 tab（docs/PLAN-LOYALTY.md §7）：使用者可設定多個航空計畫（國泰／長榮…），
 * 每個計畫一張帳戶卡＋一份逐筆 ledger。積分／哩程數字皆使用者手記，app 只對照
 * 門檻算升等進度（見 ProgramProgressCard），不自動判級。
 */
export function AirlineMemberships() {
  const t = useTranslations('collections');
  const { toast } = useToast();
  const { data, isLoading } = useLoyalty();
  const { removeAccount, removeEntry } = useLoyaltyMutations();

  const [accountDialog, setAccountDialog] = useState<AccountDialogState>({
    open: false,
    program: LOYALTY_PROGRAMS[0],
    editing: null,
  });
  const [entryDialog, setEntryDialog] = useState<EntryDialogState>({
    open: false,
    program: LOYALTY_PROGRAMS[0],
    editing: null,
  });
  const [deletingAccount, setDeletingAccount] = useState<LoyaltyAccountItem | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<LoyaltyEntryItem | null>(null);

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const entriesByProgram = useMemo(() => {
    const map = new Map<LoyaltyProgram, LoyaltyEntryItem[]>();
    for (const e of data?.entries ?? []) {
      const bucket = map.get(e.program);
      if (bucket) bucket.push(e);
      else map.set(e.program, [e]);
    }
    return map;
  }, [data]);

  // 尚未設定的航空計畫（可新增）；全部設定完則隱藏新增鈕
  const availablePrograms = useMemo(
    () => LOYALTY_PROGRAMS.filter((p) => !accounts.some((a) => a.program === p)),
    [accounts]
  );

  const openAddAccount = () => {
    if (availablePrograms.length === 0) return;
    setAccountDialog({ open: true, program: availablePrograms[0], editing: null });
  };

  const handleDeleteAccount = async () => {
    if (!deletingAccount) return;
    try {
      await removeAccount.mutateAsync(deletingAccount.id);
      setDeletingAccount(null);
    } catch (error) {
      const key = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      toast({ title: t(`errors.${key}` as Parameters<typeof t>[0]), variant: 'destructive' });
    }
  };

  const handleDeleteEntry = async () => {
    if (!deletingEntry) return;
    try {
      await removeEntry.mutateAsync(deletingEntry.id);
      setDeletingEntry(null);
    } catch (error) {
      const key = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      toast({ title: t(`errors.${key}` as Parameters<typeof t>[0]), variant: 'destructive' });
    }
  };

  if (isLoading || !data) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-8">
      {accounts.length === 0 ? (
        <EmptyState
          icon={Medal}
          title={t('loyalty.empty')}
          description={t('loyalty.emptyDesc')}
          action={
            <Button onClick={openAddAccount}>
              <Plus className="mr-2 h-4 w-4" />
              {t('loyalty.setupAccount')}
            </Button>
          }
        />
      ) : (
        <>
          {availablePrograms.length > 0 && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={openAddAccount}>
                <Plus className="mr-1 h-4 w-4" />
                {t('loyalty.setupAccount')}
              </Button>
            </div>
          )}
          {accounts.map((account) => (
            <div key={account.id} className="space-y-6">
              <ProgramProgressCard
                account={account}
                entries={entriesByProgram.get(account.program) ?? []}
                onEdit={() =>
                  setAccountDialog({ open: true, program: account.program, editing: account })
                }
                onDelete={() => setDeletingAccount(account)}
              />
              <LoyaltyLedger
                entries={entriesByProgram.get(account.program) ?? []}
                onAdd={() =>
                  setEntryDialog({ open: true, program: account.program, editing: null })
                }
                onEdit={(entry) =>
                  setEntryDialog({ open: true, program: entry.program, editing: entry })
                }
                onDelete={(entry) => setDeletingEntry(entry)}
              />
            </div>
          ))}
        </>
      )}

      <LoyaltyAccountDialog
        open={accountDialog.open}
        onOpenChange={(next) => setAccountDialog((s) => ({ ...s, open: next }))}
        program={accountDialog.program}
        editing={accountDialog.editing}
        availablePrograms={accountDialog.editing ? undefined : availablePrograms}
      />
      <LoyaltyEntryDialog
        open={entryDialog.open}
        onOpenChange={(next) => setEntryDialog((s) => ({ ...s, open: next }))}
        program={entryDialog.program}
        editing={entryDialog.editing}
      />
      <ConfirmDialog
        open={deletingAccount !== null}
        title={t('loyalty.deleteAccountTitle')}
        message={t('loyalty.deleteAccountMessage')}
        severity="error"
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        loading={removeAccount.isPending}
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeletingAccount(null)}
      />
      <ConfirmDialog
        open={deletingEntry !== null}
        title={t('loyalty.deleteEntryTitle')}
        message={t('loyalty.deleteEntryMessage')}
        severity="error"
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        loading={removeEntry.isPending}
        onConfirm={handleDeleteEntry}
        onCancel={() => setDeletingEntry(null)}
      />
    </div>
  );
}
