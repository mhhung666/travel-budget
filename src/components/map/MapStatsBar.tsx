'use client';

import { useTranslations } from 'next-intl';
import { Plane, Globe2, Building2, Route } from 'lucide-react';
import type { MapStats } from './stats';

interface MapStatsBarProps {
  stats: MapStats;
}

/**
 * 旅程數據儀表板：一排統計卡（旅程 / 國家 / 城市 / 總里程）。
 * 里程以千為單位人性化顯示（≥1000km 顯示為 1.2k km）。
 */
export default function MapStatsBar({ stats }: MapStatsBarProps) {
  const t = useTranslations('map');

  const distance =
    stats.distanceKm >= 1000
      ? `${(stats.distanceKm / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`
      : String(stats.distanceKm);

  const items = [
    { icon: Plane, value: stats.trips, label: t('statTrips') },
    { icon: Globe2, value: stats.countries, label: t('statCountries') },
    { icon: Building2, value: stats.cities, label: t('statCities') },
    { icon: Route, value: distance, label: t('statDistance'), suffix: 'km' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(({ icon: Icon, value, label, suffix }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
        >
          <Icon className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-none">
              {value}
              {suffix && (
                <span className="ml-0.5 text-xs font-normal text-muted-foreground">{suffix}</span>
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
