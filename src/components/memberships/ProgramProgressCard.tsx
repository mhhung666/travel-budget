'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Pencil, Trash2 } from 'lucide-react';

import { PROGRAM_RULES } from '@/constants/loyalty';
import { computeLoyaltyProgress, computeMilesSegmentsProgress } from '@/lib/loyalty';
import type { LoyaltyAccountItem, LoyaltyEntryItem } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatTiles } from '@/components/collections/RecordFormFields';

interface ProgramProgressCardProps {
  account: LoyaltyAccountItem;
  /** 已過濾為該 program 的 entries。 */
  entries: LoyaltyEntryItem[];
  onEdit: () => void;
  onDelete: () => void;
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

/**
 * 單一會籍計畫的帳戶卡：等級 badge＋依規則 kind 呈現進度。
 * - 積分制（CX）：本年積分／里數餘額／結轉試算＋升等進度條＋續會狀態。
 * - 哩程＋航段制（BR）：本期卡籍哩程／國際航段／里數餘額＋哩程與航段雙進度條
 *   （擇一達標即升等）。
 * 進度純對照 constants/loyalty.ts 門檻，數字皆使用者手記（app 不判級）。
 */
export function ProgramProgressCard({
  account,
  entries,
  onEdit,
  onDelete,
}: ProgramProgressCardProps) {
  const t = useTranslations('collections');
  const locale = useLocale();
  const numberFormat = new Intl.NumberFormat(locale);
  const nf = (n: number) => numberFormat.format(n);

  const rules = PROGRAM_RULES[account.program];
  const tierName = (key: string) =>
    t(`loyalty.tiers.${account.program}.${key}` as Parameters<typeof t>[0]);

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {t(`loyalty.programs.${account.program}`)}
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
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            aria-label={t('common.delete')}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {rules.kind === 'points'
        ? (() => {
            const progress = computeLoyaltyProgress(entries, rules, account.current_tier);
            const percent = progress.nextTier
              ? (progress.windowPoints / progress.nextTier.threshold) * 100
              : 100;
            return (
              <>
                <div className="mt-4">
                  <StatTiles
                    tiles={[
                      {
                        label: t('loyalty.stats.yearPoints', { year: progress.windowYear }),
                        value: nf(progress.windowPoints),
                      },
                      {
                        label: t('loyalty.stats.milesBalance'),
                        value: nf(progress.awardMilesBalance),
                      },
                      {
                        label: t('loyalty.stats.carryOver'),
                        value: nf(progress.carryOverEstimate),
                      },
                    ]}
                  />
                </div>
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {progress.nextTier
                        ? t('loyalty.progressToNext', {
                            tier: tierName(progress.nextTier.key),
                            points: nf(progress.pointsToNext ?? 0),
                          })
                        : t('loyalty.maxTier')}
                    </span>
                    {progress.nextTier && (
                      <span className="font-mono">
                        {nf(progress.windowPoints)}/{nf(progress.nextTier.threshold)}
                      </span>
                    )}
                  </div>
                  <ProgressBar percent={percent} />
                  {progress.renewal && (
                    <p className="text-xs text-muted-foreground">
                      {progress.renewal.met
                        ? t('loyalty.renewalMet', { required: nf(progress.renewal.required) })
                        : t('loyalty.renewalPending', {
                            required: nf(progress.renewal.required),
                            points: nf(progress.renewal.required - progress.windowPoints),
                          })}
                    </p>
                  )}
                </div>
              </>
            );
          })()
        : (() => {
            const progress = computeMilesSegmentsProgress(entries, rules, account.current_tier);
            const next = progress.nextTier;
            return (
              <>
                <div className="mt-4">
                  <StatTiles
                    tiles={[
                      { label: t('loyalty.stats.windowMiles'), value: nf(progress.windowMiles) },
                      { label: t('loyalty.stats.segments'), value: nf(progress.windowSegments) },
                      {
                        label: t('loyalty.stats.milesBalance'),
                        value: nf(progress.awardMilesBalance),
                      },
                    ]}
                  />
                </div>
                {next ? (
                  <div className="mt-4 space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {t('loyalty.milesToNextTier', {
                            tier: tierName(next.key),
                            miles: nf(progress.milesToNext ?? 0),
                          })}
                        </span>
                        <span className="font-mono">
                          {nf(progress.windowMiles)}/{nf(next.miles)}
                        </span>
                      </div>
                      <ProgressBar percent={(progress.windowMiles / next.miles) * 100} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {t('loyalty.segmentsToNextTier', {
                            tier: tierName(next.key),
                            segments: nf(progress.segmentsToNext ?? 0),
                          })}
                        </span>
                        <span className="font-mono">
                          {nf(progress.windowSegments)}/{nf(next.segments)}
                        </span>
                      </div>
                      <ProgressBar percent={(progress.windowSegments / next.segments) * 100} />
                    </div>
                    <p className="text-xs text-muted-foreground/80">
                      {t('loyalty.progressPathHint')}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">{t('loyalty.maxTier')}</p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">{t('loyalty.renewalNote')}</p>
              </>
            );
          })()}

      <p className="mt-3 text-xs text-muted-foreground/70">
        {t('loyalty.disclaimer', { date: rules.verifiedAt })}
      </p>
    </section>
  );
}
