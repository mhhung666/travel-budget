'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Medal, Pencil, Plane, Plus, Trash2 } from 'lucide-react';

import { PROGRAM_RULES, type LoyaltyProgram } from '@/constants/loyalty';
import { computeLoyaltyProgress } from '@/lib/loyalty';
import { useLoyalty, useLoyaltyMutations } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import type { LoyaltyAccountItem, LoyaltyEntryItem } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, EmptyState, LoadingState } from '@/components/common';
import { StatTiles } from './RecordFormFields';
import { RecordYearGroups } from './RecordYearGroups';
import { LoyaltyAccountDialog } from './LoyaltyAccountDialog';
import { LoyaltyEntryDialog } from './LoyaltyEntryDialog';

/** MVP 唯一開放的 program（Phase 2 起改為可新增多計畫的清單 UI）。 */
const MVP_PROGRAM: LoyaltyProgram = 'CX';

/**
 * 會籍 tab（docs/PLAN-LOYALTY.md §7）：帳戶卡（等級＋升等/續會進度＋里數餘額）
 * ＋積分/里數逐筆 ledger。**積分記帳，不是計算器**——數字使用者手抄，
 * 這裡只對照 constants/loyalty.ts 的門檻常數算進度。
 */
export function LoyaltyTab() {
  const t = useTranslations('collections');
  const locale = useLocale();
  const { toast } = useToast();
  const { data, isLoading } = useLoyalty();
  const { removeAccount, removeEntry } = useLoyaltyMutations();

  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<LoyaltyAccountItem | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<LoyaltyAccountItem | null>(null);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LoyaltyEntryItem | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<LoyaltyEntryItem | null>(null);

  const account = useMemo(
    () => data?.accounts.find((a) => a.program === MVP_PROGRAM) ?? null,
    [data]
  );
  const entries = useMemo(
    () => (data?.entries ?? []).filter((e) => e.program === MVP_PROGRAM),
    [data]
  );

  const rules = PROGRAM_RULES[MVP_PROGRAM];
  const progress = useMemo(
    () => computeLoyaltyProgress(entries, rules, account?.current_tier ?? null),
    [entries, rules, account]
  );

  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const tierName = (key: string) =>
    t(`loyalty.tiers.${MVP_PROGRAM}.${key}` as Parameters<typeof t>[0]);

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

  if (!account) {
    return (
      <>
        <EmptyState
          icon={Medal}
          title={t('loyalty.empty')}
          description={t('loyalty.emptyDesc')}
          action={
            <Button onClick={() => setAccountDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('loyalty.setupAccount')}
            </Button>
          }
        />
        <LoyaltyAccountDialog
          open={accountDialogOpen}
          onOpenChange={setAccountDialogOpen}
          program={MVP_PROGRAM}
          editing={null}
        />
      </>
    );
  }

  // 升等進度：以下一級門檻為分母；已達最高級則滿條
  const progressPercent = progress.nextTier
    ? Math.min(100, Math.max(0, (progress.windowPoints / progress.nextTier.threshold) * 100))
    : 100;

  return (
    <div className="space-y-6">
      {/* 帳戶卡：等級＋進度 */}
      <section className="rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {t(`loyalty.programs.${MVP_PROGRAM}`)}
              </h2>
              <Badge variant="secondary">{tierName(account.current_tier)}</Badge>
            </div>
            {account.member_no && (
              <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                {account.member_no}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t('loyalty.editAccount')}
              onClick={() => {
                setEditingAccount(account);
                setAccountDialogOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              aria-label={t('common.delete')}
              onClick={() => setDeletingAccount(account)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <StatTiles
            tiles={[
              {
                label: t('loyalty.stats.yearPoints', { year: progress.windowYear }),
                value: numberFormat.format(progress.windowPoints),
              },
              {
                label: t('loyalty.stats.milesBalance'),
                value: numberFormat.format(progress.awardMilesBalance),
              },
              {
                label: t('loyalty.stats.carryOver'),
                value: numberFormat.format(progress.carryOverEstimate),
              },
            ]}
          />
        </div>

        {/* 升等進度條 */}
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {progress.nextTier
                ? t('loyalty.progressToNext', {
                    tier: tierName(progress.nextTier.key),
                    points: numberFormat.format(progress.pointsToNext ?? 0),
                  })
                : t('loyalty.maxTier')}
            </span>
            {progress.nextTier && (
              <span className="font-mono">
                {numberFormat.format(progress.windowPoints)}/
                {numberFormat.format(progress.nextTier.threshold)}
              </span>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {progress.renewal && (
            <p className="text-xs text-muted-foreground">
              {progress.renewal.met
                ? t('loyalty.renewalMet', {
                    required: numberFormat.format(progress.renewal.required),
                  })
                : t('loyalty.renewalPending', {
                    required: numberFormat.format(progress.renewal.required),
                    points: numberFormat.format(progress.renewal.required - progress.windowPoints),
                  })}
            </p>
          )}
        </div>

        <p className="mt-3 text-xs text-muted-foreground/70">
          {t('loyalty.disclaimer', { date: rules.verifiedAt })}
        </p>
      </section>

      {/* 逐筆 ledger */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('common.records')}</h2>
          <Button
            size="sm"
            onClick={() => {
              setEditingEntry(null);
              setEntryDialogOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t('loyalty.addEntry')}
          </Button>
        </div>
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('loyalty.entriesEmpty')}
          </p>
        ) : (
          <RecordYearGroups
            items={entries}
            getDate={(e) => e.date}
            renderRow={(e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Badge variant="secondary" className="text-xs">
                      {t(`loyalty.types.${e.type}`)}
                    </Badge>
                    {e.status_points !== 0 && (
                      <span className="text-sm font-medium text-foreground">
                        {t('loyalty.pointsAmount', {
                          points: `${e.status_points > 0 ? '+' : ''}${numberFormat.format(e.status_points)}`,
                        })}
                      </span>
                    )}
                    {e.award_miles !== 0 && (
                      <span className="text-sm text-muted-foreground">
                        {t('loyalty.milesAmount', {
                          miles: `${e.award_miles > 0 ? '+' : ''}${numberFormat.format(e.award_miles)}`,
                        })}
                      </span>
                    )}
                    {e.flight_record_id && (
                      <Plane className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{e.date}</span>
                    {e.note && <span className="truncate">{e.note}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={t('common.edit')}
                    onClick={() => {
                      setEditingEntry(e);
                      setEntryDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label={t('common.delete')}
                    onClick={() => setDeletingEntry(e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          />
        )}
      </section>

      <LoyaltyAccountDialog
        open={accountDialogOpen}
        onOpenChange={(next) => {
          setAccountDialogOpen(next);
          if (!next) setEditingAccount(null);
        }}
        program={MVP_PROGRAM}
        editing={editingAccount}
      />
      <LoyaltyEntryDialog
        open={entryDialogOpen}
        onOpenChange={(next) => {
          setEntryDialogOpen(next);
          if (!next) setEditingEntry(null);
        }}
        program={MVP_PROGRAM}
        editing={editingEntry}
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
