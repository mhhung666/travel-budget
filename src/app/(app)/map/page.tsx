'use client';

import { TripMapView } from '@/components/map';
import { useTrips } from '@/hooks/queries';

// 登入守衛與 user 注入由 (app)/layout.tsx 的 App Shell 處理。
export default function MapPage() {
  const { data: trips = [], isFetching: loading, isError, error: tripsError } = useTrips();

  const error = isError
    ? tripsError instanceof Error
      ? tripsError.message
      : String(tripsError)
    : '';

  return <TripMapView trips={trips} loading={loading} error={error} />;
}
