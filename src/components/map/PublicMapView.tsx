'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { MapPin, Loader2 } from 'lucide-react';
import { pickLocalizedName } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import { Button } from '@/components/ui/button';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import MapStatsBar from './MapStatsBar';
import { computeMapStats, visitedCountrySet } from './stats';
import type { LocalizedNames } from '@/types';
import type { TripDestinationPoint, HeatPoint } from './types';
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

interface PublicDestination {
  id: string;
  point: PublicGeoPoint;
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
  const [destinations, setDestinations] = useState<PublicDestination[] | null>(null);
  const [heat, setHeat] = useState<PublicHeatPoint[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notFound' | 'error'>('loading');
  const [mode, setMode] = useState<MapMode>('countries');
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
          destinations: PublicDestination[];
          heat?: PublicHeatPoint[];
          years?: number[];
        } = await res.json();
        if (cancelled) return;
        setDestinations(data.destinations);
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

  const filteredDestinations = useMemo(() => {
    if (!destinations) return [];
    if (selectedYear === null) return destinations;
    return destinations.filter((destination) => destination.years.includes(selectedYear));
  }, [destinations, selectedYear]);

  const mapDestinations = useMemo<TripDestinationPoint[]>(
    () =>
      filteredDestinations.map((destination) => ({
        id: destination.id,
        tripName: '',
        startDate: null,
        endDate: null,
        name: pickLocalizedName(destination.point.names, locale, destination.point.name),
        lat: destination.point.lat,
        lon: destination.point.lon,
        countryCode: destination.point.countryCode,
      })),
    [filteredDestinations, locale]
  );

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

  const stats = useMemo(
    () => computeMapStats(mapDestinations.length, mapDestinations, heatPoints),
    [mapDestinations, heatPoints]
  );
  const visitedCountries = useMemo(
    () => visitedCountrySet(mapDestinations, heatPoints),
    [mapDestinations, heatPoints]
  );

  const hasHeat = heat.length > 0;

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
                {t('public.subtitle', {
                  trips: mapDestinations.length,
                  countries: stats.countries,
                })}
              </span>
              {/* 公開頁沒有主導覽列，語言切換放這裡（next-intl 會保留路徑只換 locale）。 */}
              <LanguageSwitcher />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 模式切換 */}
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {hasHeat && (
                <Button
                  variant={mode === 'heat' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => {
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
                  setMode('countries');
                }}
              >
                {t('modeCountries')}
              </Button>
            </div>

            {/* 年份快速篩選 */}
            {years.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant={selectedYear === null ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => {
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
        {mapDestinations.length === 0 && heatPoints.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <MapPin className="h-10 w-10" />
            <p>{t('public.empty')}</p>
          </div>
        ) : (
          <>
            <MapStatsBar stats={stats} showDistance={false} />
            <div className="min-h-0 flex-1">
              <TripMapCanvas
                mode={mode}
                destinations={mapDestinations}
                heatPoints={heatPoints}
                visitedCountries={visitedCountries}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
