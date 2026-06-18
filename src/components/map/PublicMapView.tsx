'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { MapPin, Loader2 } from 'lucide-react';
import { pickLocalizedName } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import type { LocalizedNames } from '@/types';
import type { GeoPoint, TripRoute } from './types';

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
}

interface PublicMapViewProps {
  code: string;
}

export default function PublicMapView({ code }: PublicMapViewProps) {
  const t = useTranslations('map');
  const locale = useLocale();
  const [routes, setRoutes] = useState<PublicRoute[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notFound' | 'error'>('loading');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        const data: { routes: PublicRoute[] } = await res.json();
        if (cancelled) return;
        setRoutes(data.routes);
        setStatus('ok');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  // 投影成畫布用的 TripRoute：去識別化（無名稱、無日期），地名依當前語系挑選。
  const mapRoutes = useMemo<TripRoute[]>(() => {
    if (!routes) return [];
    const toGeo = (p: PublicGeoPoint | null): GeoPoint | null =>
      p
        ? {
            name: pickLocalizedName(p.names, locale, p.name),
            lat: p.lat,
            lon: p.lon,
            countryCode: p.countryCode,
          }
        : null;
    return routes.map((r) => ({
      id: r.id,
      hashCode: '',
      name: '',
      startDate: null,
      endDate: null,
      departure: toGeo(r.departure),
      destination: toGeo(r.destination),
    }));
  }, [routes, locale]);

  const countryCount = useMemo(() => {
    const set = new Set<string>();
    for (const r of mapRoutes) {
      if (r.destination?.countryCode) set.add(r.destination.countryCode.toUpperCase());
    }
    return set.size;
  }, [mapRoutes]);

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
        <div className="container mx-auto flex items-baseline justify-between gap-3">
          <h1 className="text-lg font-semibold">{t('public.title')}</h1>
          <span className="text-sm text-muted-foreground">
            {t('public.subtitle', { trips: mapRoutes.length, countries: countryCount })}
          </span>
        </div>
      </header>

      <div className="container mx-auto flex min-h-0 flex-1 flex-col px-4 py-4">
        {mapRoutes.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <MapPin className="h-10 w-10" />
            <p>{t('public.empty')}</p>
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <TripMapCanvas routes={mapRoutes} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        )}
      </div>
    </div>
  );
}
