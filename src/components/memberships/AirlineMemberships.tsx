'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Hotel, Plane, Plus } from 'lucide-react';

import {
  AIRLINE_LOYALTY_PROGRAMS,
  HOTEL_LOYALTY_PROGRAMS,
  LOYALTY_PROGRAMS,
  type LoyaltyProgram,
} from '@/constants/loyalty';
import { useLoyalty, useLoyaltyMutations } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import { toLocalDateInputValue } from '@/lib/dateInput';
import type { LoyaltyAccountItem, LoyaltyEntryItem } from '@/types';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, LoadingState } from '@/components/common';
import { LoyaltyAccountDialog, LoyaltyEntryDialog } from '@/components/collections';
import { ProgramProgressCard } from './ProgramProgressCard';
import { LoyaltyLedger } from './LoyaltyLedger';
import { CxSpEstimatorDialog } from './CxSpEstimatorDialog';

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
 * 每個計畫一張帳戶卡＋一份逐筆 ledger。積分／哩程數字皆使用者手記；app 對照
 * 門檻推估升等，達標後由使用者確認同步官方卡級。
 */
export function AirlineMemberships() {
  const t = useTranslations('collections');
  const tm = useTranslations('memberships');
  const { toast } = useToast();
  const { data, isLoading } = useLoyalty();
  const { upsertAccount, removeAccount, removeEntry } = useLoyaltyMutations();

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
  const [estimatorOpen, setEstimatorOpen] = useState(false);

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
  const availableAirlines = availablePrograms.filter((program) =>
    AIRLINE_LOYALTY_PROGRAMS.includes(program as (typeof AIRLINE_LOYALTY_PROGRAMS)[number])
  );
  const availableHotels = availablePrograms.filter((program) =>
    HOTEL_LOYALTY_PROGRAMS.includes(program as (typeof HOTEL_LOYALTY_PROGRAMS)[number])
  );

  const openAddAccount = (programs: LoyaltyProgram[]) => {
    if (programs.length === 0) return;
    setAccountDialog({ open: true, program: programs[0], editing: null });
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

  const handleConfirmTier = async (account: LoyaltyAccountItem, tier: string) => {
    try {
      await upsertAccount.mutateAsync({
        program: account.program,
        current_tier: tier,
        tier_started_at: account.program === 'MB' ? null : toLocalDateInputValue(),
        // CI/BR 升等後官方會重新給卡籍效期，不能沿用舊卡日期。
        tier_expires_at:
          account.program === 'CX' || account.program === 'MB' ? account.tier_expires_at : null,
        member_no: account.member_no,
        lifetime_nights: account.lifetime_nights,
        lifetime_silver_years: account.lifetime_silver_years,
        lifetime_gold_years: account.lifetime_gold_years,
        lifetime_platinum_years: account.lifetime_platinum_years,
        note: account.note,
      });
      toast({
        title: t(
          account.program === 'CI' || account.program === 'BR'
            ? 'loyalty.tierUpdatedNeedsReview'
            : 'loyalty.tierUpdated'
        ),
      });
    } catch (error) {
      const key = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      toast({ title: t(`errors.${key}` as Parameters<typeof t>[0]), variant: 'destructive' });
    }
  };

  if (isLoading || !data) {
    return <LoadingState />;
  }

  const renderAccount = (account: LoyaltyAccountItem) => (
    <ProgramProgressCard
      key={account.id}
      account={account}
      entries={entriesByProgram.get(account.program) ?? []}
      defaultOpen
      onEdit={() => setAccountDialog({ open: true, program: account.program, editing: account })}
      onDelete={() => setDeletingAccount(account)}
      onEstimate={account.program === 'CX' ? () => setEstimatorOpen(true) : undefined}
      onConfirmTier={
        account.program === 'CX' && toLocalDateInputValue() < '2027-01-01'
          ? undefined
          : (tier) => handleConfirmTier(account, tier)
      }
      confirmingTier={upsertAccount.isPending}
    >
      <LoyaltyLedger
        entries={entriesByProgram.get(account.program) ?? []}
        onAdd={() => setEntryDialog({ open: true, program: account.program, editing: null })}
        onEdit={(entry) => setEntryDialog({ open: true, program: entry.program, editing: entry })}
        onDelete={(entry) => setDeletingEntry(entry)}
      />
    </ProgramProgressCard>
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Plane className="h-4 w-4" aria-hidden />
            {tm('airlineHeading')}
          </h2>
          {availableAirlines.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => openAddAccount(availableAirlines)}>
              <Plus className="mr-1 h-4 w-4" />
              {t('loyalty.setupAccount')}
            </Button>
          )}
        </div>
        {accounts.filter((account) => account.program !== 'MB').map(renderAccount)}
        {accounts.every((account) => account.program === 'MB') && (
          <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
            {tm('airlineEmpty')}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Hotel className="h-4 w-4" aria-hidden />
            {tm('hotelHeading')}
          </h2>
          {availableHotels.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => openAddAccount(availableHotels)}>
              <Plus className="mr-1 h-4 w-4" />
              {t('loyalty.setupAccount')}
            </Button>
          )}
        </div>
        {accounts.filter((account) => account.program === 'MB').map(renderAccount)}
        {accounts.every((account) => account.program !== 'MB') && (
          <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
            {tm('hotelEmpty')}
          </p>
        )}
      </section>

      <LoyaltyAccountDialog
        open={accountDialog.open}
        onOpenChange={(next) => setAccountDialog((s) => ({ ...s, open: next }))}
        program={accountDialog.program}
        editing={accountDialog.editing}
        availablePrograms={
          accountDialog.editing
            ? undefined
            : accountDialog.program === 'MB'
              ? availableHotels
              : availableAirlines
        }
      />
      <LoyaltyEntryDialog
        open={entryDialog.open}
        onOpenChange={(next) => setEntryDialog((s) => ({ ...s, open: next }))}
        program={entryDialog.program}
        editing={entryDialog.editing}
      />
      <CxSpEstimatorDialog open={estimatorOpen} onOpenChange={setEstimatorOpen} />
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
