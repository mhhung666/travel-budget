'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { MapPin, Loader2, Play, Square } from 'lucide-react';
import { pickLocalizedName } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import { Button } from '@/components/ui/button';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import MapStatsBar from './MapStatsBar';
import { computeMapStats, visitedCountrySet } from './stats';
import type { LocalizedNames } from '@/types';
import type { GeoPoint, TripRoute, HeatPoint } from './types';
import type { MapMode } from './TripMapCanvas';

// Leaflet 依賴 window，必須關閉 SSR。
const TripMapCanvas = dynamic(() => import('./TripMapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

/** 公開 API 回傳的去識別化座標點。 */
interface PublicGeoPoint {
  name: string;
  names?: LocalizedNames;
  lat: number;
  lon: number;
  countryCode?: string;
}

interface PublicRoute {
  id: string;
  departure: PublicGeoPoint | null;
  destination: PublicGeoPoint;
  years: number[];
}

/** 去識別化熱點：座標 + 權重 + 年份（year=null 代表無日期旅程）。 */
interface PublicHeatPoint {
  lat: number;
  lon: number;
  weight: number;
  year: number | null;
}

interface PublicMapViewProps {
  code: string;
}

export default function PublicMapView({ code }: PublicMapViewProps) {
  const t = useTranslations('map');
  const locale = useLocale();
  const [routes, setRoutes] = useState<PublicRoute[] | null>(null);
  const [heat, setHeat] = useState<PublicHeatPoint[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notFound' | 'error'>('loading');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>('routes');
  // null = 全部年份。
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(ROUTES.API.PUBLIC_MAP(code));
        if (cancelled) return;
        if (res.status === 404) {
          setStatus('notFound');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }
        const data: {
          routes: PublicRoute[];
          heat?: PublicHeatPoint[];
          years?: number[];
        } = await res.json();
        if (cancelled) return;
        setRoutes(data.routes);
        setHeat(data.heat ?? []);
        setYears(data.years ?? []);
        setStatus('ok');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  // 依選定年份過濾路線（年份只到「年」，仍去識別化）。
  const filteredRoutes = useMemo(() => {
    if (!routes) return [];
    if (selectedYear === null) return routes;
    return routes.filter((r) => r.years.includes(selectedYear));
  }, [routes, selectedYear]);

  // 投影成畫布用的 TripRoute：去識別化（無名稱、無日期），地名依當前語系挑選。
  const mapRoutes = useMemo<TripRoute[]>(() => {
    const toGeo = (p: PublicGeoPoint | null): GeoPoint | null =>
      p
        ? {
            name: pickLocalizedName(p.names, locale, p.name),
            lat: p.lat,
            lon: p.lon,
            countryCode: p.countryCode,
          }
        : null;
    return filteredRoutes.map((r) => ({
      id: r.id,
      hashCode: '',
      name: '',
      startDate: null,
      endDate: null,
      departure: toGeo(r.departure),
      destination: toGeo(r.destination),
    }));
  }, [filteredRoutes, locale]);

  // 依年份過濾熱點，並依座標彙總（全部年份時把各年份權重相加成單點）。
  const heatPoints = useMemo<HeatPoint[]>(() => {
    const rows = selectedYear === null ? heat : heat.filter((h) => h.year === selectedYear);
    const map = new Map<string, HeatPoint>();
    for (const h of rows) {
      const key = `${h.lat},${h.lon}`;
      const existing = map.get(key);
      if (existing) existing.weight += h.weight;
      else map.set(key, { lat: h.lat, lon: h.lon, weight: h.weight });
    }
    return [...map.values()];
  }, [heat, selectedYear]);

  const stats = useMemo(() => computeMapStats(mapRoutes, heatPoints), [mapRoutes, heatPoints]);
  const visitedCountries = useMemo(
    () => visitedCountrySet(mapRoutes, heatPoints),
    [mapRoutes, heatPoints]
  );

  const hasHeat = heat.length > 0;

  // 足跡回放（與主地圖一致）。setState 只在回呼中觸發。
  const [playing, setPlaying] = useState(false);
  const [revealCount, setRevealCount] = useState<number | undefined>(undefined);
  const stepRef = useRef(0);
  const stopPlay = () => {
    setPlaying(false);
    setRevealCount(undefined);
  };
  const startPlay = () => {
    if (mapRoutes.length === 0) return;
    stepRef.current = 0;
    setSelectedId(mapRoutes[0]?.id ?? null);
    setRevealCount(1);
    setPlaying(true);
  };
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      stepRef.current += 1;
      if (stepRef.current >= mapRoutes.length) {
        clearInterval(timer);
        setTimeout(() => {
          setPlaying(false);
          setRevealCount(undefined);
        }, 1200);
        return;
      }
      setSelectedId(mapRoutes[stepRef.current]?.id ?? null);
      setRevealCount(stepRef.current + 1);
    }, 1300);
    return () => clearInterval(timer);
  }, [playing, mapRoutes]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === 'notFound' || status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center text-muted-foreground">
        <MapPin className="h-10 w-10" />
        <p>{t('public.notFound')}</p>
      </div>
    );
  }

  return (
    // 佔滿視窗高度、地圖以 flex 填滿剩餘空間，避免硬算高度而多出 scrollbar。
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <div className="container mx-auto flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-semibold">{t('public.title')}</h1>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t('public.subtitle', { trips: mapRoutes.length, countries: stats.countries })}
              </span>
              {/* 公開頁沒有主導覽列，語言切換放這裡（next-intl 會保留路徑只換 locale）。 */}
              <LanguageSwitcher />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 模式切換 */}
            <div className="inline-flex rounded-lg border border-border p-0.5">
              <Button
                variant={mode === 'routes' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setMode('routes')}
              >
                {t('modeRoutes')}
              </Button>
              {hasHeat && (
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
              )}
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

            {/* 足跡回放（航線模式） */}
            {mode === 'routes' && mapRoutes.length > 0 && (
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
          </div>
        </div>
      </header>

      <div className="container mx-auto flex min-h-0 flex-1 flex-col gap-3 px-4 py-4">
        {mapRoutes.length === 0 && heatPoints.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <MapPin className="h-10 w-10" />
            <p>{t('public.empty')}</p>
          </div>
        ) : (
          <>
            <MapStatsBar stats={stats} />
            <div className="min-h-0 flex-1">
              <TripMapCanvas
                mode={mode}
                routes={mapRoutes}
                heatPoints={heatPoints}
                visitedCountries={visitedCountries}
                revealCount={revealCount}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
