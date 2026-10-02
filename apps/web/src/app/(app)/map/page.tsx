'use client';

import { TripMapView } from '@/components/map';
import { useTrips } from '@/hooks/queries';
import { QueryFeedback } from '@/components/common/QueryFeedback';

// 登入守衛與 user 注入由 (app)/layout.tsx 的 App Shell 處理。
export default function MapPage() {
  const query = useTrips();
  return (
    <>
      <QueryFeedback
        hasData={query.data !== undefined}
        isError={query.isError}
        isFetching={query.isFetching}
        isPaused={query.isPaused}
        onRetry={() => void query.refetch()}
      />
      {(query.data !== undefined || query.isLoading) && (
        <TripMapView trips={query.data ?? []} loading={query.isLoading} error="" />
      )}
    </>
  );
}
