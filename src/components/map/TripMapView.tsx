'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { MapPin, Loader2, ArrowRight, Play, Square } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { pickLocalizedName } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { tripOverlapsRange } from '@/lib/dateRange';
import { useVisitedPlaces } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MapShareDialog from './MapShareDialog';
import MapStatsBar from './MapStatsBar';
import { computeMapStats, visitedCountrySet } from './stats';
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

  // 行程日地點：供熱點、儀表板「城市數」、國家點亮一起用，故一律查；年份篩選連動。
  const { data: visited = [] } = useVisitedPlaces(true, selectedYear);
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

  // 儀表板數字與國家點亮，都跟著年份篩選後的 routes / heatPoints 走。
  const stats = useMemo(() => computeMapStats(routes, heatPoints), [routes, heatPoints]);
  const visitedCountries = useMemo(
    () => visitedCountrySet(routes, heatPoints),
    [routes, heatPoints]
  );

  // 國家模式側欄：依造訪城市次數排序的國家清單。
  const rankedCountries = useMemo(() => {
    const map = new Map<string, { code: string; cities: number; visits: number }>();
    for (const p of heatPoints) {
      const code = p.countryCode?.toUpperCase();
      if (!code) continue;
      const e = map.get(code) ?? { code, cities: 0, visits: 0 };
      e.cities += 1;
      e.visits += p.weight;
      map.set(code, e);
    }
    for (const r of routes) {
      for (const c of [r.departure?.countryCode, r.destination?.countryCode]) {
        const code = c?.toUpperCase();
        if (code && !map.has(code)) map.set(code, { code, cities: 0, visits: 0 });
      }
    }
    return [...map.values()].sort((a, b) => b.visits - a.visits || b.cities - a.cities);
  }, [heatPoints, routes]);

  // 足跡回放：依時間逐條揭露路線並飛向當前目的地。
  // revealCount = undefined 代表沒在播放（顯示全部）。
  const [playing, setPlaying] = useState(false);
  const [revealCount, setRevealCount] = useState<number | undefined>(undefined);
  const stepRef = useRef(0);

  const stopPlay = () => {
    setPlaying(false);
    setRevealCount(undefined);
  };
  const startPlay = () => {
    if (routes.length === 0) return;
    stepRef.current = 0;
    setSelectedId(routes[0]?.id ?? null);
    setRevealCount(1);
    setPlaying(true);
  };

  // 播放時每 1.3s 揭露下一條；播完停留約 1.2s 後收尾（回到全部顯示）。
  // setState 都在 interval/timeout 回呼中，不在 effect 主體同步呼叫。
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      stepRef.current += 1;
      if (stepRef.current >= routes.length) {
        clearInterval(timer);
        setTimeout(() => {
          setPlaying(false);
          setRevealCount(undefined);
        }, 1200);
        return;
      }
      setSelectedId(routes[stepRef.current]?.id ?? null);
      setRevealCount(stepRef.current + 1);
    }, 1300);
    return () => clearInterval(timer);
  }, [playing, routes]);

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
      {/* 工具列：模式切換 + 年份篩選（同時作用於航線與熱點）+ 分享 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 lg:shrink-0">
        {/* 模式切換：航線 / 熱點 / 國家 */}
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
            onClick={() => {
              stopPlay();
              setMode('heat');
            }}
          >
            {t('modeHeat')}
          </Button>
          <Button
            variant={mode === 'countries' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => {
              stopPlay();
              setMode('countries');
            }}
          >
            {t('modeCountries')}
          </Button>
        </div>

        {/* 足跡回放：只在航線模式且有路線時提供 */}
        {mode === 'routes' && routes.length > 0 && (
          <Button
            variant={playing ? 'secondary' : 'outline'}
            size="sm"
            className="h-7 gap-1 px-3 text-xs"
            onClick={playing ? stopPlay : startPlay}
          >
            {playing ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {playing ? t('playStop') : t('playRoute')}
          </Button>
        )}

        {/* 年份快速篩選 */}
        {years.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant={selectedYear === null ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => {
                stopPlay();
                setSelectedYear(null);
              }}
            >
              {t('filterAll')}
            </Button>
            {years.map((y) => (
              <Button
                key={y}
                variant={selectedYear === y ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => {
                  stopPlay();
                  setSelectedYear(y);
                }}
              >
                {y}
              </Button>
            ))}
          </div>
        )}

        <div className="ml-auto">
          <MapShareDialog />
        </div>
      </div>

      {/* 旅程數據儀表板 */}
      <div className="mb-4 lg:shrink-0">
        <MapStatsBar stats={stats} />
      </div>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_1fr]">
        {/* 時間軸列表 */}
        <aside className="order-2 min-w-0 lg:order-1 lg:overflow-y-auto lg:pr-1">
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
          ) : mode === 'countries' ? (
            <>
              <h2 className="mb-3 px-1 text-sm font-medium text-muted-foreground">
                {t('countryTitle', { count: rankedCountries.length })}
              </h2>
              {rankedCountries.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">{t('heatEmpty')}</p>
              ) : (
                <ol className="space-y-1.5">
                  {rankedCountries.map((c) => (
                    <li
                      key={c.code}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <span className="shrink-0 text-lg">{countryCodeToFlag(c.code)}</span>
                        <span className="truncate font-medium">{c.code}</span>
                      </span>
                      {c.cities > 0 && (
                        <Badge variant="secondary" className="shrink-0">
                          {t('countryCities', { count: c.cities })}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <>
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
        <div className="order-1 h-[50vh] min-w-0 overflow-hidden rounded-lg lg:order-2 lg:h-full">
          <TripMapCanvas
            mode={mode}
            routes={routes}
            heatPoints={heatPoints}
            visitedCountries={visitedCountries}
            revealCount={revealCount}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      </div>
    </div>
  );
}
