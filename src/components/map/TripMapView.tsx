'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { MapPin, Loader2, ArrowRight } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { pickLocalizedName } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { tripOverlapsRange } from '@/lib/dateRange';
import { useVisitedPlaces } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MapShareDialog from './MapShareDialog';
import type { Location } from '@/types';
import type { TripWithMembers } from '@/types';
import type { GeoPoint, TripRoute, HeatPoint } from './types';
import type { MapMode } from './TripMapCanvas';
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
  // null = 全部年份；否則只看與該年（1/1–12/31）重疊的旅程。
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [mode, setMode] = useState<MapMode>('routes');

  // 熱點資料只在切到熱點模式時才查。
  const { data: visited = [] } = useVisitedPlaces(mode === 'heat');
  const heatPoints = useMemo<HeatPoint[]>(
    () =>
      visited.map((p) => ({
        lat: p.lat,
        lon: p.lon,
        weight: p.weight,
        name: pickLocalizedName(p.names, locale, p.name),
        countryCode: p.countryCode,
      })),
    [visited, locale]
  );
  // 熱點側欄：依造訪次數排序的地點清單。
  const rankedPlaces = useMemo(
    () => [...heatPoints].sort((a, b) => b.weight - a.weight),
    [heatPoints]
  );

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

  // 旅程涉及的年份（依起訖日），新到舊；當作快速篩選的選項。
  const years = useMemo<number[]>(() => {
    const set = new Set<number>();
    for (const r of projected) {
      if (r.startDate) set.add(new Date(r.startDate).getFullYear());
      if (r.endDate) set.add(new Date(r.endDate).getFullYear());
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [projected]);

  // 依選定年份過濾：保留起訖與該年重疊的旅程（跨年旅程會同時出現在兩年）。
  // 重疊判斷與 stats 共用（src/lib/dateRange.ts）；無日期者在選定年份時排除。
  const routes = useMemo<TripRoute[]>(() => {
    if (selectedYear === null) return projected;
    const lo = new Date(selectedYear, 0, 1);
    const hi = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
    return projected.filter((r) =>
      tripOverlapsRange(
        r.startDate ? new Date(r.startDate) : null,
        r.endDate ? new Date(r.endDate) : null,
        lo,
        hi
      )
    );
  }, [projected, selectedYear]);

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
    // 桌機：佔滿視窗高度的 flex 欄，避免地圖高度硬算（會多出一點點 scrollbar）；
    // 列表在自己的欄內捲動。手機維持一般文件流捲動。
    <div className="container mx-auto px-4 pt-20 pb-8 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden lg:pb-4">
      <div className="mb-4 flex items-center justify-between gap-2 lg:shrink-0">
        {/* 模式切換：航線 / 熱點 */}
        <div className="inline-flex rounded-lg border border-border p-0.5">
          <Button
            variant={mode === 'routes' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setMode('routes')}
          >
            {t('modeRoutes')}
          </Button>
          <Button
            variant={mode === 'heat' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setMode('heat')}
          >
            {t('modeHeat')}
          </Button>
        </div>
        <MapShareDialog />
      </div>
      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_1fr]">
        {/* 時間軸列表 */}
        <aside className="order-2 lg:order-1 lg:overflow-y-auto lg:pr-1">
          {mode === 'heat' ? (
            <>
              <h2 className="mb-3 px-1 text-sm font-medium text-muted-foreground">
                {t('heatTitle', { count: rankedPlaces.length })}
              </h2>
              {rankedPlaces.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">{t('heatEmpty')}</p>
              ) : (
                <ol className="space-y-1.5">
                  {rankedPlaces.map((p) => (
                    <li
                      key={`${p.lat},${p.lon}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-sm">
                        <span className="shrink-0">{countryCodeToFlag(p.countryCode)}</span>
                        <span className="truncate">{p.name}</span>
                      </span>
                      <Badge variant="secondary" className="shrink-0">
                        {t('heatVisits', { count: p.weight })}
                      </Badge>
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <>
              {/* 年份快速篩選（取代不好用的日期選擇器） */}
              {years.length > 0 && (
                <div className="mb-3 space-y-2 rounded-lg border border-border p-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t('filterLabel')}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant={selectedYear === null ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-3 text-xs"
                      onClick={() => setSelectedYear(null)}
                    >
                      {t('filterAll')}
                    </Button>
                    {years.map((y) => (
                      <Button
                        key={y}
                        variant={selectedYear === y ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-3 text-xs"
                        onClick={() => setSelectedYear(y)}
                      >
                        {y}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

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
            </>
          )}
        </aside>

        {/* 地圖 */}
        <div className="order-1 h-[50vh] lg:order-2 lg:h-full">
          <TripMapCanvas
            mode={mode}
            routes={routes}
            heatPoints={heatPoints}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      </div>
    </div>
  );
}
