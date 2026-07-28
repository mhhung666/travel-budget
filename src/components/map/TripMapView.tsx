'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, ArrowLeftRight, Camera, Plane, Flame, Globe2, Images } from 'lucide-react';
import { pickLocalizedName } from '@/lib/utils';
import { tripOverlapsRange } from '@/lib/dateRange';
import { useVisitedPlaces, useMapPhotos, useCollections, useAirports } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MapShareDialog from './MapShareDialog';
import MapStatsBar from './MapStatsBar';
import PhotoPinDialog from './PhotoPinDialog';
import { computeMapStats, visitedCountrySet } from './stats';
import { groupPhotoAreas, groupPhotoPins, type PhotoPin } from './photos';
import type { Location } from '@/types';
import type { TripWithMembers } from '@/types';
import type { GeoPoint, TripDestinationPoint, HeatPoint, FlightSegment } from './types';
import type { MapMode } from './TripMapCanvas';
import { countryCodeToFlag } from './country';
import { groupFlightRoutes } from './flights';

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
  const [selectedFlightKey, setSelectedFlightKey] = useState<string | null>(null);

  // 行程日地點（造訪次數權重）：供儀表板「城市數」、國家點亮與熱點一起用。
  const { data: visited = [] } = useVisitedPlaces(true, selectedYear);
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
  // 地圖維持精細釘點；側欄另外按地名／鄰近區域彙整，避免同一城市出現許多碎片列。
  const photoAreas = useMemo(() => groupPhotoAreas(photoPins), [photoPins]);

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

  // 飛行航線：往返紀錄依機場配對合併，避免同一路線重疊；年份篩選連動。
  const flightSegments = useMemo<FlightSegment[]>(() => {
    if (!collections || !airports) return [];
    return groupFlightRoutes(collections.flights, airports, selectedYear);
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

  // 城市數 / 國家點亮 / 國家排行共用造訪地點集。
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

  const countryNames = useMemo(() => {
    const intlLocale =
      locale === 'jp' ? 'ja-JP' : locale === 'zh' ? 'zh-TW' : locale === 'zh-CN' ? 'zh-CN' : 'en';
    try {
      return new Intl.DisplayNames([intlLocale], { type: 'region' });
    } catch {
      return null;
    }
  }, [locale]);

  const modeMeta = {
    flights: {
      icon: Plane,
      title: t('flightTitle', { count: flightSegments.length }),
      description: t('flightDescription'),
    },
    heat: {
      icon: Flame,
      title: t('heatTitle', { count: rankedPlaces.length }),
      description: t('heatDescription'),
    },
    countries: {
      icon: Globe2,
      title: t('countryTitle', { count: rankedCountries.length }),
      description: t('countryDescription'),
    },
    photos: {
      icon: Images,
      title: t('photoTitle', { count: mapPhotos.length }),
      description: t('photoDescription', { spots: photoPins.length }),
    },
  } satisfies Record<MapMode, { icon: typeof Plane; title: string; description: string }>;
  const activeMeta = modeMeta[mode];
  const ActiveModeIcon = activeMeta.icon;

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

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[360px_1fr]">
        {/* 旅行總覽：統計、目前圖層說明與清單集中在同一資訊面板。 */}
        <aside className="order-2 min-w-0 overflow-hidden rounded-xl border border-border bg-card lg:order-1 lg:flex lg:min-h-0 lg:flex-col">
          <div className="border-b border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t('overviewTitle')}</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedYear === null
                    ? t('overviewPeriodAll')
                    : t('overviewPeriodYear', { year: selectedYear })}
                </p>
              </div>
              <Badge variant="outline">{selectedYear ?? t('filterAll')}</Badge>
            </div>
            <MapStatsBar stats={stats} compact />
          </div>

          <div className="border-b border-border px-4 py-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 rounded-md bg-primary/10 p-1.5 text-primary">
                <ActiveModeIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-medium">{activeMeta.title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {activeMeta.description}
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {mode === 'heat' ? (
              <>
                {rankedPlaces.length === 0 ? (
                  <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                    {t('heatEmpty')}
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {rankedPlaces.map((p, index) => (
                      <li
                        key={`${p.lat},${p.lon}`}
                        className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-2.5"
                      >
                        <span className="flex min-w-0 items-center gap-2.5 text-sm">
                          <span className="w-5 shrink-0 text-center text-xs font-medium text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="shrink-0 text-base">
                            {countryCodeToFlag(p.countryCode)}
                          </span>
                          <span className="truncate font-medium">{p.name}</span>
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
                {rankedCountries.length === 0 ? (
                  <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                    {t('heatEmpty')}
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {rankedCountries.map((c) => (
                      <li
                        key={c.code}
                        className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-2.5"
                      >
                        <span className="flex min-w-0 items-center gap-2.5 text-sm">
                          <span className="shrink-0 text-xl">{countryCodeToFlag(c.code)}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {countryNames?.of(c.code) ?? c.code}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {c.code}
                              {c.visits > 0 && ` · ${t('heatVisits', { count: c.visits })}`}
                            </span>
                          </span>
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
                {flightSegments.length === 0 ? (
                  <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                    {t('flightEmpty')}
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {flightSegments.map((s) => (
                      <li key={s.key}>
                        <button
                          type="button"
                          aria-pressed={selectedFlightKey === s.key}
                          onClick={() =>
                            setSelectedFlightKey((current) => (current === s.key ? null : s.key))
                          }
                          className={`flex w-full items-center justify-between gap-3 rounded-lg p-2.5 text-left transition-colors ${
                            selectedFlightKey === s.key
                              ? 'bg-primary/10 ring-1 ring-primary/30'
                              : 'bg-muted/40 hover:bg-muted/70'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2.5 text-sm">
                            <Plane className="h-4 w-4 shrink-0 text-primary" />
                            <span className="min-w-0">
                              <span className="block font-medium">
                                <span className="font-mono">{s.from.iata}</span>
                                <ArrowLeftRight className="mx-1 inline h-3 w-3" />
                                <span className="font-mono">{s.to.iata}</span>
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {s.from.name} ⇄ {s.to.name}
                              </span>
                            </span>
                          </span>
                          <Badge variant="secondary" className="shrink-0">
                            ×{s.count}
                          </Badge>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : mode === 'photos' ? (
              <>
                {photoPins.length === 0 ? (
                  <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                    {t('photoEmpty')}
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {photoAreas.map((area) => {
                      // 無法取得地名的地區，退最新一張的拍攝日期當辨識標籤。
                      const takenAt = area.photos[0]?.taken_at;
                      const label =
                        area.name || (takenAt ? new Date(takenAt).toLocaleDateString(locale) : '—');
                      const thumbs = area.photos.slice(0, 3);
                      return (
                        <li key={area.id}>
                          <button
                            type="button"
                            onClick={() => setActivePin(area)}
                            className="flex w-full items-center justify-between gap-3 rounded-lg bg-muted/40 p-2 text-left transition-colors hover:bg-muted"
                          >
                            <span className="flex min-w-0 items-center gap-2.5 text-sm">
                              <span className="relative h-11 w-[3.75rem] shrink-0">
                                {thumbs.map((photo, index) => (
                                  // eslint-disable-next-line @next/next/no-img-element -- presigned R2 縮圖不走 next/image
                                  <img
                                    key={photo.id}
                                    src={photo.thumb_url}
                                    alt=""
                                    loading="lazy"
                                    className="absolute top-0.5 h-10 w-10 rounded-md border-2 border-card object-cover shadow-sm"
                                    style={{
                                      left: `${index * 10}px`,
                                      zIndex: thumbs.length - index,
                                    }}
                                  />
                                ))}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium">
                                  {countryCodeToFlag(area.countryCode)} {label}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {t('photoSpotCount', { count: area.spotCount })}
                                </span>
                              </span>
                            </span>
                            <Badge variant="secondary" className="shrink-0 gap-1">
                              <Camera className="h-3 w-3" />
                              {area.photos.length}
                            </Badge>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </>
            ) : null}
          </div>
        </aside>

        {/* 地圖 */}
        <div className="order-1 h-[50vh] min-w-0 overflow-hidden rounded-lg lg:order-2 lg:h-full">
          <TripMapCanvas
            mode={mode}
            destinations={filteredDestinations}
            flightSegments={flightSegments}
            selectedFlightKey={selectedFlightKey}
            onFlightSelect={setSelectedFlightKey}
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
