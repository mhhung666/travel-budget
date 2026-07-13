'use client';

import { useTranslations } from 'next-intl';
import { BedDouble, Gem, Globe2, Handshake, Hotel, Plane, PlaneTakeoff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { BadgeMetric, BadgeStatus } from '@/lib/badges';

/** metric → 圖示（徽章不用圖片資產，沿用品牌牆的 monogram/icon 語彙）。 */
const METRIC_ICON: Record<BadgeMetric, LucideIcon> = {
  flights: Plane,
  airlines: PlaneTakeoff,
  alliances: Handshake,
  stays: Hotel,
  brands: BedDouble,
  luxuryBrands: Gem,
  countries: Globe2,
};

/**
 * 里程碑徽章牆（ROADMAP #19 P3）：已解鎖上色、未解鎖灰階＋進度條。
 * 登入成就頁與公開分享卡共用（輸入只是 BadgeStatus[]，不含任何逐筆紀錄）。
 */
export function BadgeWall({ badges }: { badges: BadgeStatus[] }) {
  const t = useTranslations('collections');

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {badges.map((b) => {
        const Icon = METRIC_ICON[b.metric];
        const progress = Math.min(b.value / b.target, 1);
        return (
          <div
            key={b.id}
            className={cn(
              'rounded-xl border p-4',
              b.achieved ? 'border-primary/40 bg-primary/5' : 'bg-card opacity-75'
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                  b.achieved ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {t(`badges.names.${b.id}` as Parameters<typeof t>[0])}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t(`badges.metrics.${b.metric}` as Parameters<typeof t>[0], {
                    target: b.target,
                  })}
                </div>
              </div>
            </div>
            {!b.achieved && (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/50"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <div className="mt-1 text-right text-xs tabular-nums text-muted-foreground">
                  {b.value}/{b.target}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
