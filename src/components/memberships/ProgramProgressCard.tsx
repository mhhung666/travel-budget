'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Calculator, ChevronDown, Pencil, Trash2 } from 'lucide-react';

import { PROGRAM_RULES } from '@/constants/loyalty';
import { computeLoyaltyProgress, computeMilesSegmentsProgress } from '@/lib/loyalty';
import type { LoyaltyAccountItem, LoyaltyEntryItem } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { StatTiles } from '@/components/collections/RecordFormFields';

interface ProgramProgressCardProps {
  account: LoyaltyAccountItem;
  /** 已過濾為該 program 的 entries。 */
  entries: LoyaltyEntryItem[];
  onEdit: () => void;
  onDelete: () => void;
  /** 有提供才顯示「試算」鈕（目前僅 CX 有預估表）。 */
  onEstimate?: () => void;
  /** 初始展開狀態（單一帳戶預設展開、多帳戶預設收合）。 */
  defaultOpen?: boolean;
  /** 展開區尾端內容（該 program 的 ledger）。 */
  children?: React.ReactNode;
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
 * 單一會籍計畫區塊：收合列（計畫名＋等級 badge＋迷你進度）點開才有詳情
 * （StatTiles、進度條、續會/結轉、帳戶操作、ledger——由 children 傳入）。
 * - 積分制（CX）：本年積分／里數餘額／結轉試算＋升等進度條＋續會狀態。
 * - 哩程＋航段制（BR）：本期卡籍哩程／國際航段／里數餘額＋哩程與航段雙進度條
 *   （擇一達標即升等）；收合列取完成率較高的路徑顯示。
 * 進度純對照 constants/loyalty.ts 門檻，數字皆使用者手記（app 不判級）。
 */
export function ProgramProgressCard({
  account,
  entries,
  onEdit,
  onDelete,
  onEstimate,
  defaultOpen = false,
  children,
}: ProgramProgressCardProps) {
  const t = useTranslations('collections');
  const locale = useLocale();
  const [open, setOpen] = useState(defaultOpen);
  const numberFormat = new Intl.NumberFormat(locale);
  const nf = (n: number) => numberFormat.format(n);

  const rules = PROGRAM_RULES[account.program];
  const tierName = (key: string) =>
    t(`loyalty.tiers.${account.program}.${key}` as Parameters<typeof t>[0]);

  // 收合列的迷你進度（文字＋百分比）與展開區詳情，依規則 kind 各算一次
  let summaryText: string;
  let summaryPercent: number;
  let detail: React.ReactNode;

  if (rules.kind === 'points') {
    const progress = computeLoyaltyProgress(entries, rules, account.current_tier);
    summaryText = progress.nextTier
      ? `${nf(progress.windowPoints)}/${nf(progress.nextTier.threshold)}`
      : t('loyalty.maxTier');
    summaryPercent = progress.nextTier
      ? (progress.windowPoints / progress.nextTier.threshold) * 100
      : 100;
    detail = (
      <>
        <div className="mt-3">
          <StatTiles
            tiles={[
              {
                label: t('loyalty.stats.yearPoints', { year: progress.windowYear }),
                value: nf(progress.windowPoints),
              },
              { label: t('loyalty.stats.milesBalance'), value: nf(progress.awardMilesBalance) },
              { label: t('loyalty.stats.carryOver'), value: nf(progress.carryOverEstimate) },
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
          <ProgressBar percent={summaryPercent} />
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
  } else {
    const progress = computeMilesSegmentsProgress(entries, rules, account.current_tier);
    const next = progress.nextTier;
    if (next) {
      // 哩程／航段擇一達標——收合列顯示完成率較高的路徑
      const milesPercent = next.miles > 0 ? (progress.windowMiles / next.miles) * 100 : 0;
      const segmentsPercent =
        next.segments > 0 ? (progress.windowSegments / next.segments) * 100 : 0;
      const milesLead = milesPercent >= segmentsPercent;
      summaryText = milesLead
        ? t('loyalty.summaryMiles', {
            value: nf(progress.windowMiles),
            total: nf(next.miles),
          })
        : t('loyalty.summarySegments', {
            value: nf(progress.windowSegments),
            total: nf(next.segments),
          });
      summaryPercent = Math.max(milesPercent, segmentsPercent);
    } else {
      summaryText = t('loyalty.maxTier');
      summaryPercent = 100;
    }
    detail = (
      <>
        <div className="mt-3">
          <StatTiles
            tiles={[
              { label: t('loyalty.stats.windowMiles'), value: nf(progress.windowMiles) },
              { label: t('loyalty.stats.segments'), value: nf(progress.windowSegments) },
              { label: t('loyalty.stats.milesBalance'), value: nf(progress.awardMilesBalance) },
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
            <p className="text-xs text-muted-foreground/80">{t('loyalty.progressPathHint')}</p>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">{t('loyalty.maxTier')}</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t('loyalty.renewalNote')}</p>
      </>
    );
  }

  return (
    <section className="rounded-xl border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full p-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {t(`loyalty.programs.${account.program}`)}
              </h2>
              <Badge variant="secondary">{tierName(account.current_tier)}</Badge>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{summaryText}</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </div>
          </div>
          <div className="mt-2.5">
            <ProgressBar percent={summaryPercent} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t px-4 pb-4 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 font-mono text-xs text-muted-foreground">
                {account.member_no}
              </div>
              <div className="flex shrink-0 gap-1">
                {onEstimate && (
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onEstimate}>
                    <Calculator className="h-4 w-4" />
                    {t('loyalty.estimate')}
                  </Button>
                )}
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

            {detail}

            <p className="mt-3 text-xs text-muted-foreground/70">
              {t('loyalty.disclaimer', { date: rules.verifiedAt })}
            </p>

            {children && <div className="mt-6">{children}</div>}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
