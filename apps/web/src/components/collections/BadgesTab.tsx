'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { computeBadgeCounts, computeBadges } from '@/lib/badges';
import { ALLIANCE_COUNT } from '@/constants/alliances';
import type { FlightRecordItem, StayRecordItem, VisitedCountryItem } from '@/types';
import { StatTiles } from './RecordFormFields';
import { BadgeWall } from './BadgeWall';
import { CollectionsShareDialog } from './CollectionsShareDialog';

/**
 * 徽章 tab（ROADMAP #19 P3）：里程碑徽章牆＋公開分享入口。
 * 徽章完全由彙總數字推導（lib/badges.ts），與公開分享卡同一套計算。
 */
export function BadgesTab({
  flights,
  stays,
  countries,
}: {
  flights: FlightRecordItem[];
  stays: StayRecordItem[];
  countries: VisitedCountryItem[];
}) {
  const t = useTranslations('collections');

  const counts = useMemo(
    () => computeBadgeCounts(flights, stays, countries.length),
    [flights, stays, countries]
  );
  const badges = useMemo(() => computeBadges(counts), [counts]);
  const earned = badges.filter((b) => b.achieved).length;

  return (
    <div className="space-y-6">
      <StatTiles
        tiles={[
          { label: t('badges.stats.earned'), value: `${earned}/${badges.length}` },
          { label: t('flights.stats.alliances'), value: `${counts.alliances}/${ALLIANCE_COUNT}` },
          { label: t('badges.stats.countries'), value: counts.countries },
        ]}
      />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('badges.wall')}</h2>
          <CollectionsShareDialog />
        </div>
        <BadgeWall badges={badges} />
      </section>
    </div>
  );
}
