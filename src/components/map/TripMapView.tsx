'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, ArrowRight, Camera, Plane } from 'lucide-react';
import { pickLocalizedName } from '@/lib/utils';
import { tripOverlapsRange } from '@/lib/dateRange';
import { useVisitedPlaces, useMapPhotos, useCollections, useAirports } from '@/hooks/queries';
import type { HeatWeightBy } from '@/actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MapShareDialog from './MapShareDialog';
import MapStatsBar from './MapStatsBar';
import PhotoPinDialog from './PhotoPinDialog';
import { computeMapStats, visitedCountrySet } from './stats';
import { groupPhotoPins, type PhotoPin } from './photos';
import type { Location } from '@/types';
import type { TripWithMembers } from '@/types';
import type { GeoPoint, TripDestinationPoint, HeatPoint, FlightSegment } from './types';
import type { MapMode } from './TripMapCanvas';
import { countryCodeToFlag } from './country';

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
  // null = 全部年份；否則只看與該年（1/1–12/31）重疊的旅程。
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [mode, setMode] = useState<MapMode>('flights');
  // 熱點權重依據：造訪次數（預設）或花費總額。只在熱點模式有意義。
  const [heatWeight, setHeatWeight] = useState<HeatWeightBy>('visits');

  // 行程日地點（造訪次數權重）：供儀表板「城市數」、國家點亮、預設熱點一起用，故一律查。
  // 年份篩選連動。城市數/國家點亮恆以此（visits）為準，不受花費權重切換影響。
  const { data: visited = [] } = useVisitedPlaces(true, selectedYear);
  // 花費權重的熱點：只在熱點模式且選了花費權重時才查（含關聯支出的 $lookup，較重）。
  const { data: visitedSpend = [] } = useVisitedPlaces(
    mode === 'heat' && heatWeight === 'spend',
    selectedYear,
    'spend'
  );
  // 相片釘點：只在相片模式才查（含 $lookup 關聯行程日，較重）。年份篩選連動。
  const { data: mapPhotos = [] } = useMapPhotos(mode === 'photos', selectedYear);
  // 飛行航線（旅行成就）：紀錄＋機場目錄都只在飛行模式才抓；登入限定、不進公開分享。
  const { data: collections } = useCollections(mode === 'flights');
  const { data: airports } = useAirports(mode === 'flights');
  // 開啟中的相片釘點（gallery 對話框）。
  const [activePin, setActivePin] = useState<PhotoPin | null>(null);
  const photoPins = useMemo<PhotoPin[]>(
    () =>
      groupPhotoPins(
        mapPhotos.map((p) => ({ ...p, name: pickLocalizedName(p.names, locale, p.name) }))
      ),
    [mapPhotos, locale]
  );

  const heatSource = heatWeight === 'spend' ? visitedSpend : visited;
  const heatPoints = useMemo<HeatPoint[]>(
    () =>
      heatSource.map((p) => ({
        lat: p.lat,
        lon: p.lon,
        weight: p.weight,
        name: pickLocalizedName(p.names, locale, p.name),
        countryCode: p.countryCode,
      })),
    [heatSource, locale]
  );
  // 熱點側欄：依權重（造訪次數或花費）排序的地點清單。
  const rankedPlaces = useMemo(
    () => [...heatPoints].sort((a, b) => b.weight - a.weight),
    [heatPoints]
  );

  // 花費權重的金額格式化（基準幣 TWD，無小數）。app locale 'jp' 非合法 BCP-47，需轉成 'ja-JP'。
  const formatSpend = useMemo(() => {
    const intlLocale =
      locale === 'jp'
        ? 'ja-JP'
        : locale === 'zh'
          ? 'zh-TW'
          : locale === 'zh-CN'
            ? 'zh-CN'
            : 'en-US';
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }, [locale]);

  // 旅行只提供主要目的地點位；實際航線一律由 FlightRecord 提供。
  const destinations = useMemo<TripDestinationPoint[]>(() => {
    const toPoint = (loc: Location | null | undefined, fallbackName: string): GeoPoint | null => {
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;
      return {
        name: pickLocalizedName(loc.names, locale, loc.name || fallbackName),
        lat: loc.lat,
        lon: loc.lon,
        countryCode: loc.country_code,
      };
    };

    return trips
      .map((tr) => {
        const point = toPoint(tr.destination_location, tr.name);
        return point
          ? {
              ...point,
              id: tr.id,
              tripName: tr.name,
              startDate: tr.start_date,
              endDate: tr.end_date,
            }
          : null;
      })
      .filter((destination): destination is TripDestinationPoint => destination !== null)
      .sort((a, b) => {
        const ta = a.startDate ? new Date(a.startDate).getTime() : Infinity;
        const tb = b.startDate ? new Date(b.startDate).getTime() : Infinity;
        return ta - tb;
      });
  }, [trips, locale]);

  // 飛行航段：FlightRecord 依「出發→抵達」聚合，座標自機場目錄解析；年份篩選連動。
  const flightSegments = useMemo<FlightSegment[]>(() => {
    if (!collections || !airports) return [];
    const byIata = new Map(airports.map((a) => [a.iata, a]));
    const toPoint = (iata: string) => {
      const a = byIata.get(iata);
      return a
        ? { iata, name: a.city ?? a.name, lat: a.lat, lon: a.lon, country: a.country }
        : null;
    };
    const map = new Map<string, FlightSegment>();
    for (const f of collections.flights) {
      if (!f.from_airport || !f.to_airport) continue;
      if (selectedYear !== null && f.date.slice(0, 4) !== String(selectedYear)) continue;
      const key = `${f.from_airport}-${f.to_airport}`;
      const cur = map.get(key);
      if (cur) {
        cur.count += 1;
        continue;
      }
      const from = toPoint(f.from_airport);
      const to = toPoint(f.to_airport);
      if (!from || !to) continue;
      map.set(key, { key, from, to, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [collections, airports, selectedYear]);

  // 旅程涉及的年份（依起訖日），新到舊；當作快速篩選的選項。
  // 飛行模式載入成就資料後，把飛行紀錄的年份也併入（歷史回填可能早於任何旅程）。
  const years = useMemo<number[]>(() => {
    const set = new Set<number>();
    for (const trip of trips) {
      if (trip.start_date) set.add(new Date(trip.start_date).getFullYear());
      if (trip.end_date) set.add(new Date(trip.end_date).getFullYear());
    }
    for (const f of collections?.flights ?? []) {
      const y = Number(f.date.slice(0, 4));
      if (Number.isFinite(y) && y > 0) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [trips, collections]);

  const filteredTrips = useMemo(() => {
    if (selectedYear === null) return trips;
    const lo = new Date(selectedYear, 0, 1);
    const hi = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
    return trips.filter((trip) =>
      tripOverlapsRange(
        trip.start_date ? new Date(trip.start_date) : null,
        trip.end_date ? new Date(trip.end_date) : null,
        lo,
        hi
      )
    );
  }, [trips, selectedYear]);

  const filteredTripIds = useMemo(
    () => new Set(filteredTrips.map((trip) => trip.id)),
    [filteredTrips]
  );
  const filteredDestinations = useMemo(
    () => destinations.filter((destination) => filteredTripIds.has(destination.id)),
    [destinations, filteredTripIds]
  );

  // 城市數 / 國家點亮 / 國家排行恆以「造訪次數」地點集為準（不受花費權重切換影響，
  // 否則切到花費權重時，沒記帳的城市與國家會從儀表板與國家圖消失）。
  const visitsPoints = useMemo<HeatPoint[]>(
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

  // 飛行里程只來自實際 FlightRecord 航段，不再以旅行目的地推測交通距離。
  const stats = useMemo(
    () => computeMapStats(filteredTrips.length, filteredDestinations, visitsPoints, flightSegments),
    [filteredTrips.length, filteredDestinations, visitsPoints, flightSegments]
  );
  const visitedCountries = useMemo(
    () => visitedCountrySet(filteredDestinations, visitsPoints),
    [filteredDestinations, visitsPoints]
  );

  // 國家模式側欄：依造訪城市次數排序的國家清單。
  const rankedCountries = useMemo(() => {
    const map = new Map<string, { code: string; cities: number; visits: number }>();
    const cityKeys = new Map<string, Set<string>>();
    const addCity = (code: string, lat: number, lon: number) => {
      const set = cityKeys.get(code) ?? new Set<string>();
      set.add(`${lat.toFixed(2)},${lon.toFixed(2)}`);
      cityKeys.set(code, set);
    };
    for (const p of visitsPoints) {
      const code = p.countryCode?.toUpperCase();
      if (!code) continue;
      const e = map.get(code) ?? { code, cities: 0, visits: 0 };
      e.visits += p.weight;
      map.set(code, e);
      addCity(code, p.lat, p.lon);
    }
    for (const destination of filteredDestinations) {
      const code = destination.countryCode?.toUpperCase();
      if (code && !map.has(code)) map.set(code, { code, cities: 0, visits: 0 });
      if (code) addCity(code, destination.lat, destination.lon);
    }
    for (const [code, entry] of map) entry.cities = cityKeys.get(code)?.size ?? 0;
    return [...map.values()].sort((a, b) => b.visits - a.visits || b.cities - a.cities);
  }, [visitsPoints, filteredDestinations]);

  if (loading) {
    return (
      <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="container mx-auto px-4 py-10 text-center text-destructive">{error}</div>;
  }

  return (
    // 桌機：扣掉 sticky 頂列（4rem）與 main 底部 padding（2rem）後佔滿視窗高度的 flex 欄，
    // 避免地圖高度硬算（會多出一點點 scrollbar）；列表在自己的欄內捲動。手機維持一般文件流捲動。
    <div className="container mx-auto px-4 pt-4 pb-8 lg:flex lg:h-[calc(100vh-6rem)] lg:flex-col lg:overflow-hidden lg:pb-4">
      {/* 工具列：飛行是唯一線段資料；其餘模式呈現旅行目的地與行程內容。 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 lg:shrink-0">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          <Button
            variant={mode === 'flights' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setMode('flights')}
          >
            {t('modeFlights')}
          </Button>
          <Button
            variant={mode === 'heat' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setMode('heat')}
          >
            {t('modeHeat')}
          </Button>
          <Button
            variant={mode === 'countries' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setMode('countries')}
          >
            {t('modeCountries')}
          </Button>
          <Button
            variant={mode === 'photos' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setMode('photos')}
          >
            {t('modePhotos')}
          </Button>
        </div>

        {/* 熱點權重切換：造訪次數 / 花費總額（只在熱點模式提供） */}
        {mode === 'heat' && (
          <div className="inline-flex rounded-lg border border-border p-0.5">
            <Button
              variant={heatWeight === 'visits' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setHeatWeight('visits')}
            >
              {t('heatByVisits')}
            </Button>
            <Button
              variant={heatWeight === 'spend' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setHeatWeight('spend')}
            >
              {t('heatBySpend')}
            </Button>
          </div>
        )}

        {/* 年份快速篩選 */}
        {years.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant={selectedYear === null ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setSelectedYear(null)}
            >
              {t('filterAll')}
            </Button>
            {years.map((y) => (
              <Button
                key={y}
                variant={selectedYear === y ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setSelectedYear(y)}
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
                        {heatWeight === 'spend'
                          ? formatSpend.format(p.weight)
                          : t('heatVisits', { count: p.weight })}
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
          ) : mode === 'flights' ? (
            <>
              <h2 className="mb-3 px-1 text-sm font-medium text-muted-foreground">
                {t('flightTitle', { count: flightSegments.length })}
              </h2>
              {flightSegments.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">{t('flightEmpty')}</p>
              ) : (
                <ol className="space-y-1.5">
                  {flightSegments.map((s) => (
                    <li
                      key={s.key}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-sm">
                        <Plane className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          <span className="font-mono font-medium">{s.from.iata}</span>
                          <ArrowRight className="mx-1 inline h-3 w-3" />
                          <span className="font-mono font-medium">{s.to.iata}</span>
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {s.from.name} → {s.to.name}
                          </span>
                        </span>
                      </span>
                      <Badge variant="secondary" className="shrink-0">
                        ×{s.count}
                      </Badge>
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : mode === 'photos' ? (
            <>
              <h2 className="mb-3 px-1 text-sm font-medium text-muted-foreground">
                {t('photoTitle', { count: photoPins.length })}
              </h2>
              {photoPins.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">{t('photoEmpty')}</p>
              ) : (
                <ol className="space-y-1.5">
                  {photoPins.map((pin) => {
                    // 純 EXIF、未關聯行程日的釘點沒有地名，退最新一張的拍攝日期當標籤。
                    const takenAt = pin.photos[0]?.taken_at;
                    const label =
                      pin.name || (takenAt ? new Date(takenAt).toLocaleDateString(locale) : '—');
                    return (
                      <li key={pin.id}>
                        <button
                          type="button"
                          onClick={() => setActivePin(pin)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border p-2 text-left transition-colors hover:bg-muted/50"
                        >
                          <span className="flex min-w-0 items-center gap-2.5 text-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element -- presigned R2 縮圖不走 next/image */}
                            <img
                              src={pin.photos[0]?.thumb_url}
                              alt=""
                              loading="lazy"
                              className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                            />
                            <span className="min-w-0">
                              <span className="block truncate">
                                {countryCodeToFlag(pin.countryCode)} {label}
                              </span>
                            </span>
                          </span>
                          <Badge variant="secondary" className="shrink-0 gap-1">
                            <Camera className="h-3 w-3" />
                            {pin.photos.length}
                          </Badge>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          ) : null}
        </aside>

        {/* 地圖 */}
        <div className="order-1 h-[50vh] min-w-0 overflow-hidden rounded-lg lg:order-2 lg:h-full">
          <TripMapCanvas
            mode={mode}
            destinations={filteredDestinations}
            flightSegments={flightSegments}
            heatPoints={heatPoints}
            visitedCountries={visitedCountries}
            photoPins={photoPins}
            onPhotoPinSelect={setActivePin}
          />
        </div>
      </div>

      <PhotoPinDialog pin={activePin} onOpenChange={(open) => !open && setActivePin(null)} />
    </div>
  );
}
