'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { MapPin, Loader2, ArrowRight, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { pickLocalizedName } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { tripOverlapsRange } from '@/lib/dateRange';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Location } from '@/types';
import type { TripWithMembers } from '@/types';
import type { GeoPoint, TripRoute } from './types';
import { countryCodeToFlag, countryColor } from './country';

// Leaflet 依賴 window，必須關閉 SSR。
const TripMapCanvas = dynamic(() => import('./TripMapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

interface TripMapViewProps {
  trips: TripWithMembers[];
  loading: boolean;
  error: string;
}

export default function TripMapView({ trips, loading, error }: TripMapViewProps) {
  const t = useTranslations('map');
  const locale = useLocale();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const hasFilter = rangeStart !== '' || rangeEnd !== '';

  // 把每趟旅行投影成「出發地 → 目的地」；至少要有目的地座標才上圖。
  const projected = useMemo<TripRoute[]>(() => {
    const toPoint = (loc: Location | null | undefined, fallbackName: string): GeoPoint | null => {
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;
      return {
        name: pickLocalizedName(loc.names, locale, loc.name || fallbackName),
        lat: loc.lat,
        lon: loc.lon,
        countryCode: loc.country_code,
      };
    };

    return (
      trips
        .map((tr) => ({
          id: tr.id,
          hashCode: tr.hash_code,
          name: tr.name,
          startDate: tr.start_date,
          endDate: tr.end_date,
          departure: toPoint(tr.departure_location, tr.name),
          destination: toPoint(tr.destination_location, tr.name),
        }))
        // 目的地座標是上圖的必要條件。
        .filter((r): r is TripRoute => r.destination !== null)
        // 依出發日正序，讓編號讀作 1→2→3 的旅行順序；未設日期者排最後。
        .sort((a, b) => {
          const ta = a.startDate ? new Date(a.startDate).getTime() : Infinity;
          const tb = b.startDate ? new Date(b.startDate).getTime() : Infinity;
          return ta - tb;
        })
    );
  }, [trips, locale]);

  // 依日期區間過濾：保留起訖與區間重疊的旅行；有篩選時，無日期者排除。
  // 重疊判斷與 stats 共用（src/lib/dateRange.ts）。
  const routes = useMemo<TripRoute[]>(() => {
    if (!hasFilter) return projected;
    const lo = rangeStart ? new Date(rangeStart) : null;
    const hi = rangeEnd ? new Date(`${rangeEnd}T23:59:59.999`) : null;
    return projected.filter((r) =>
      tripOverlapsRange(
        r.startDate ? new Date(r.startDate) : null,
        r.endDate ? new Date(r.endDate) : null,
        lo,
        hi
      )
    );
  }, [projected, hasFilter, rangeStart, rangeEnd]);

  const clearFilter = () => {
    setRangeStart('');
    setRangeEnd('');
  };

  const formatRange = (start: string | null, end: string | null) => {
    const fmt = (d: string) => new Date(d).toLocaleDateString(locale);
    if (start && end) return `${fmt(start)} – ${fmt(end)}`;
    if (start) return fmt(start);
    if (end) return fmt(end);
    return t('noDate');
  };

  if (loading) {
    return (
      <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 pt-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="container mx-auto px-4 pt-24 text-center text-destructive">{error}</div>;
  }

  if (projected.length === 0) {
    return (
      <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 pt-20 text-center text-muted-foreground">
        <MapPin className="h-10 w-10" />
        <p>{t('empty')}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 pt-20 pb-8">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* 時間軸列表 */}
        <aside className="order-2 lg:order-1">
          {/* 日期區間篩選 */}
          <div className="mb-3 space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('filterLabel')}
              </span>
              {hasFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={clearFilter}
                >
                  <X className="h-3 w-3" />
                  {t('filterClear')}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="h-8 flex-1 text-xs"
              />
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                type="date"
                value={rangeEnd}
                min={rangeStart}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="h-8 flex-1 text-xs"
              />
            </div>
          </div>

          <h2 className="mb-3 px-1 text-sm font-medium text-muted-foreground">
            {t('timelineTitle', { count: routes.length })}
          </h2>
          {routes.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">{t('noResults')}</p>
          ) : (
            <ol className="space-y-2">
              {routes.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    onDoubleClick={() => router.push(ROUTES.TRIP_DETAIL(r.hashCode))}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                      selectedId === r.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
                        selectedId === r.id && 'ring-2 ring-primary ring-offset-1'
                      )}
                      style={{ backgroundColor: countryColor(r.destination?.countryCode) }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {r.departure && (
                          <>
                            <span className="truncate">
                              {countryCodeToFlag(r.departure.countryCode)} {r.departure.name}
                            </span>
                            <ArrowRight className="h-3 w-3 shrink-0" />
                          </>
                        )}
                        <span className="truncate">
                          {countryCodeToFlag(r.destination?.countryCode)} {r.destination?.name}
                        </span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatRange(r.startDate, r.endDate)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </aside>

        {/* 地圖 */}
        <div className="order-1 h-[50vh] lg:order-2 lg:h-[calc(100vh-8rem)]">
          <TripMapCanvas routes={routes} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>
    </div>
  );
}
