'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { MapPin, Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { pickLocalizedName } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { TripWithMembers } from '@/types';
import type { TripPoint } from './types';

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

  // 只取有座標的旅程，並依出發日（無則退回建立時間）由近到遠排序。
  const points = useMemo<TripPoint[]>(() => {
    return trips
      .filter(
        (tr): tr is TripWithMembers & { location: NonNullable<TripWithMembers['location']> } =>
          !!tr.location &&
          Number.isFinite(tr.location.lat) &&
          Number.isFinite(tr.location.lon)
      )
      .map((tr) => ({
        id: tr.id,
        hashCode: tr.hash_code,
        name: pickLocalizedName(tr.location.names, locale, tr.location.name || tr.name),
        lat: tr.location.lat,
        lon: tr.location.lon,
        startDate: tr.start_date,
        endDate: tr.end_date,
      }))
      .sort((a, b) => {
        const ta = a.startDate ? new Date(a.startDate).getTime() : 0;
        const tb = b.startDate ? new Date(b.startDate).getTime() : 0;
        return tb - ta;
      });
  }, [trips, locale]);

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
    return (
      <div className="container mx-auto px-4 pt-24 text-center text-destructive">{error}</div>
    );
  }

  if (points.length === 0) {
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
          <h2 className="mb-3 px-1 text-sm font-medium text-muted-foreground">
            {t('timelineTitle', { count: points.length })}
          </h2>
          <ol className="space-y-2">
            {points.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  onDoubleClick={() => router.push(ROUTES.TRIP_DETAIL(p.hashCode))}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                    selectedId === p.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  <MapPin
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0',
                      selectedId === p.id ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatRange(p.startDate, p.endDate)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        {/* 地圖 */}
        <div className="order-1 h-[50vh] lg:order-2 lg:h-[calc(100vh-8rem)]">
          <TripMapCanvas points={points} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>
    </div>
  );
}
