'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUp, Calculator, ChevronDown, Gift, Pencil, Trash2 } from 'lucide-react';

import { PROGRAM_RULES, TIER_BADGE_COLORS } from '@/constants/loyalty';
import {
  computeLoyaltyProgress,
  computeMilesSegmentsProgress,
  computeNightsProgress,
} from '@/lib/loyalty';
import { toLocalDateInputValue } from '@/lib/dateInput';
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
  /** 依已登記紀錄達到較高卡級時，確認同步官方目前等級。 */
  onConfirmTier?: (tier: string) => void;
  confirmingTier?: boolean;
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
 * 進度純對照 constants/loyalty.ts 門檻，數字皆使用者手記；推估達標後可確認同步卡級。
 */
export function ProgramProgressCard({
  account,
  entries,
  onEdit,
  onDelete,
  onEstimate,
  onConfirmTier,
  confirmingTier = false,
  children,
}: ProgramProgressCardProps) {
  const t = useTranslations('collections');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const numberFormat = new Intl.NumberFormat(locale);
  const usdFormat = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
  const nf = (n: number) => numberFormat.format(n);
  const asOf = toLocalDateInputValue();

  const rules = PROGRAM_RULES[account.program];
  const tierName = (key: string) =>
    t(`loyalty.tiers.${account.program}.${key}` as Parameters<typeof t>[0]);
  // 等級 tag 底色＝官方卡面近似色（docs/TIER-COLORS.md）；查無則 fallback secondary
  const tierColor = TIER_BADGE_COLORS[account.program]?.[account.current_tier];

  // 收合列的迷你進度（文字＋百分比）與展開區詳情，依規則 kind 各算一次
  let summaryText: string;
  let summaryPercent: number;
  let detail: React.ReactNode;
  let estimatedTierKey = account.current_tier;

  if (rules.kind === 'points') {
    // 使用者自設等級對到的 tier 規則（term2y 未設效期時的提示要判斷有沒有續會門檻）
    const currentTierRule = rules.tiers.find((tr) => tr.key === account.current_tier) ?? null;
    const progress = computeLoyaltyProgress(
      entries,
      rules,
      account.current_tier,
      account.tier_expires_at,
      asOf,
      account.tier_started_at
    );
    estimatedTierKey = progress.achievedTier.key;
    summaryText = progress.nextTier
      ? `${nf(progress.windowPoints)}/${nf(progress.nextTier.threshold)}`
      : t('loyalty.maxTier');
    summaryPercent = progress.nextTier
      ? (progress.windowPoints / progress.nextTier.threshold) * 100
      : 100;
    // renewalWindow: 'term2y' 需卡籍效期才能算續卡——currentTier 有門檻但沒效期時給提示
    const needsExpiryHint =
      rules.renewalWindow === 'term2y' &&
      !progress.renewal &&
      currentTierRule?.renewalThreshold != null;
    const ownAirlineWarning =
      rules.ownAirlineMinRatio != null &&
      progress.ownAirlineRatio !== null &&
      progress.ownAirlineRatio < rules.ownAirlineMinRatio;
    const pointTiles = [
      {
        label:
          rules.window === 'calendar'
            ? t('loyalty.stats.yearPoints', { year: progress.windowYear ?? 0 })
            : t('loyalty.stats.points12m'),
        value: nf(progress.windowPoints),
      },
      { label: t('loyalty.stats.milesBalance'), value: nf(progress.awardMilesBalance) },
      rules.rollover
        ? { label: t('loyalty.stats.carryOver'), value: nf(progress.carryOverEstimate) }
        : {
            label: t('loyalty.stats.ownAirlineRatio'),
            value:
              progress.ownAirlineRatio == null
                ? '—'
                : `${Math.round(progress.ownAirlineRatio * 100)}%`,
          },
    ];
    detail = (
      <>
        <div className="mt-3">
          <StatTiles tiles={pointTiles} />
          <p className="mt-2 text-xs text-muted-foreground">
            {rules.window === 'calendar'
              ? t('loyalty.windowCalendar', { year: progress.windowYear ?? 0 })
              : t('loyalty.windowRange', {
                  start: progress.windowStart ?? '',
                  end: asOf,
                })}
          </p>
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
          {progress.requiredSegments != null && (
            <p
              className={`text-xs ${
                progress.qualifyingSegments >= progress.requiredSegments
                  ? 'text-muted-foreground'
                  : 'text-warning'
              }`}
            >
              {t('loyalty.cxSegmentsProgress', {
                value: nf(progress.qualifyingSegments),
                required: nf(progress.requiredSegments),
              })}
            </p>
          )}
          {progress.renewal && (
            <p className="text-xs text-muted-foreground">
              {progress.renewal.met
                ? t('loyalty.renewalMet', { required: nf(progress.renewal.required) })
                : t('loyalty.renewalPending', {
                    required: nf(progress.renewal.required),
                    points: nf(progress.renewal.required - progress.renewal.points),
                  })}
            </p>
          )}
          {progress.renewal &&
            rules.ownAirlineMinRatio != null &&
            (progress.renewal.ownAirlineRatio == null ||
              progress.renewal.ownAirlineRatio < rules.ownAirlineMinRatio) && (
              <p className="text-xs text-warning">
                {t('loyalty.renewalOwnAirlineWarning', {
                  percent: Math.round((progress.renewal.ownAirlineRatio ?? 0) * 100),
                  required: Math.round(rules.ownAirlineMinRatio * 100),
                })}
              </p>
            )}
          {needsExpiryHint && (
            <p className="text-xs text-muted-foreground">{t('loyalty.renewalNeedsExpiry')}</p>
          )}
          {ownAirlineWarning && (
            <p className="text-xs text-warning">
              {t('loyalty.ownAirlineWarning', {
                percent: Math.round((progress.ownAirlineRatio ?? 0) * 100),
                required: Math.round(rules.ownAirlineMinRatio! * 100),
              })}
            </p>
          )}
        </div>
      </>
    );
  } else if (rules.kind === 'nights') {
    const progress = computeNightsProgress(entries, rules, asOf, {
      nights: account.lifetime_nights,
      silverYears: account.lifetime_silver_years,
      goldYears: account.lifetime_gold_years,
      platinumYears: account.lifetime_platinum_years,
    });
    estimatedTierKey = progress.achievedTier.key;
    const next = progress.nextTier;
    summaryText = next
      ? t('loyalty.summaryNights', {
          value: nf(progress.windowNights),
          total: nf(next.nights),
        })
      : t('loyalty.maxTier');
    const nightsPercent = next ? (progress.windowNights / next.nights) * 100 : 100;
    const spendPercent =
      next?.qualifyingSpendUsd != null
        ? (progress.windowSpendUsd / next.qualifyingSpendUsd) * 100
        : 100;
    summaryPercent = Math.min(nightsPercent, spendPercent);

    detail = (
      <>
        <div className="mt-3">
          <StatTiles
            tiles={[
              {
                label: t('loyalty.stats.yearNights', { year: progress.windowYear }),
                value: nf(progress.windowNights),
              },
              {
                label: t('loyalty.stats.qualifiedSpend'),
                value: usdFormat.format(progress.windowSpendUsd),
              },
              {
                label: t('loyalty.stats.pointsBalance'),
                value: nf(progress.rewardPointsBalance),
              },
            ]}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t('loyalty.windowCalendar', { year: progress.windowYear })}
          </p>
        </div>
        {next ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {t('loyalty.nightsToNextTier', {
                  tier: tierName(next.key),
                  nights: nf(progress.nightsToNext ?? 0),
                })}
              </span>
              <span className="font-mono">
                {nf(progress.windowNights)}/{nf(next.nights)}
              </span>
            </div>
            <ProgressBar percent={nightsPercent} />
            {next.qualifyingSpendUsd != null && (
              <>
                <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                  <span>
                    {t('loyalty.spendToAmbassador', {
                      spend: usdFormat.format(progress.spendToNextUsd),
                    })}
                  </span>
                  <span className="font-mono">
                    {usdFormat.format(progress.windowSpendUsd)}/
                    {usdFormat.format(next.qualifyingSpendUsd)}
                  </span>
                </div>
                <ProgressBar percent={spendPercent} />
              </>
            )}
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">{t('loyalty.maxTier')}</p>
        )}

        {(progress.choiceBenefitsReached.length > 0 || progress.nextChoiceBenefit != null) && (
          <div className="mt-4 rounded-lg border border-dashed p-3 text-xs">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Gift className="h-4 w-4 text-primary" aria-hidden />
              {t('loyalty.choiceBenefit')}
            </div>
            {progress.choiceBenefitsReached.length > 0 && (
              <p className="mt-1 text-muted-foreground">
                {t('loyalty.choiceBenefitReached', {
                  nights: progress.choiceBenefitsReached.map(nf).join('、'),
                })}
              </p>
            )}
            {progress.nextChoiceBenefit != null && (
              <p className="mt-1 text-muted-foreground">
                {t('loyalty.choiceBenefitNext', {
                  nights: nf(progress.nextChoiceBenefit - progress.windowNights),
                  threshold: nf(progress.nextChoiceBenefit),
                })}
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <p className="text-xs font-medium text-foreground">{t('loyalty.lifetimeProgress')}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {progress.lifetime.map((lifetime) => (
              <div key={lifetime.key} className="rounded-lg bg-secondary/50 p-2.5 text-xs">
                <p className="font-medium text-foreground">
                  {t('loyalty.lifetimeTier', { tier: tierName(lifetime.key) })}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {t('loyalty.lifetimeRequirement', {
                    nights: nf(lifetime.nights),
                    requiredNights: nf(lifetime.requiredNights),
                    years: nf(lifetime.years),
                    requiredYears: nf(lifetime.requiredYears),
                  })}
                </p>
                {lifetime.met && (
                  <p className="mt-1 font-medium text-primary">{t('loyalty.requirementMet')}</p>
                )}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground/80">
          {t('loyalty.marriottNightsDisclaimer')}
        </p>
      </>
    );
  } else {
    // 使用者自設等級對到的 tier 規則（未設效期但有續卡門檻時的提示要用）
    const currentTierRule = rules.tiers.find((tr) => tr.key === account.current_tier) ?? null;
    const progress = computeMilesSegmentsProgress(
      entries,
      rules,
      account.current_tier,
      account.tier_expires_at,
      asOf,
      account.tier_started_at
    );
    estimatedTierKey = progress.achievedTier.key;
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
          <p className="mt-2 text-xs text-muted-foreground">
            {t('loyalty.windowRange', { start: progress.windowStart, end: asOf })}
          </p>
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
        {progress.renewal ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              progress.renewal.met
                ? 'loyalty.renewalProgressMet'
                : 'loyalty.renewalProgressPending',
              {
                date: account.tier_expires_at ?? '',
                miles: nf(progress.renewal.miles),
                requiredMiles: nf(progress.renewal.requiredMiles),
                segments: nf(progress.renewal.segments),
                requiredSegments: nf(progress.renewal.requiredSegments),
              }
            )}
          </p>
        ) : (
          <>
            <p className="mt-3 text-xs text-muted-foreground">{t('loyalty.renewalNote')}</p>
            {currentTierRule?.renewalMiles != null && (
              <p className="text-xs text-muted-foreground">{t('loyalty.renewalNeedsExpiry')}</p>
            )}
          </>
        )}
      </>
    );
  }

  const currentTierIndex = rules.tiers.findIndex((tier) => tier.key === account.current_tier);
  const estimatedTierIndex = rules.tiers.findIndex((tier) => tier.key === estimatedTierKey);
  const upgradeSuggested = estimatedTierIndex > currentTierIndex;
  const estimatedTierColor = TIER_BADGE_COLORS[account.program]?.[estimatedTierKey];
  const maskedMemberNo =
    account.member_no.length > 4 ? `•••• ${account.member_no.slice(-4)}` : account.member_no;
  const isCxTransition = account.program === 'CX' && asOf < '2027-01-01';

  return (
    <section className="rounded-xl border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full p-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {t(`loyalty.programs.${account.program}`)}
              </h2>
              {tierColor ? (
                <Badge
                  variant="secondary"
                  className="border-transparent text-white"
                  style={{ backgroundColor: tierColor }}
                >
                  {tierName(account.current_tier)}
                </Badge>
              ) : (
                <Badge variant="secondary">{tierName(account.current_tier)}</Badge>
              )}
              {upgradeSuggested && (
                <Badge
                  variant="outline"
                  className="gap-1"
                  style={
                    estimatedTierColor
                      ? { borderColor: estimatedTierColor, color: estimatedTierColor }
                      : undefined
                  }
                >
                  <ArrowUp className="h-3 w-3" aria-hidden />
                  {t(isCxTransition ? 'loyalty.estimated2027Tier' : 'loyalty.estimatedTier', {
                    tier: tierName(estimatedTierKey),
                  })}
                </Badge>
              )}
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
                {maskedMemberNo}
              </div>
              <div className="flex shrink-0 gap-1">
                {upgradeSuggested && onConfirmTier && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={confirmingTier}
                    onClick={() => onConfirmTier(estimatedTierKey)}
                  >
                    <ArrowUp className="h-4 w-4" />
                    {t('loyalty.confirmTier')}
                  </Button>
                )}
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

            <p className="mt-3 text-xs text-muted-foreground">
              {isCxTransition
                ? t('loyalty.cxTransitionNote', { estimated: tierName(estimatedTierKey) })
                : t('loyalty.officialVsEstimated', {
                    official: tierName(account.current_tier),
                    estimated: tierName(estimatedTierKey),
                  })}
            </p>

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
