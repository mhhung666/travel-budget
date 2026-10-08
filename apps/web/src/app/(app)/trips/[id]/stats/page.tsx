'use client';
import { QueryStatus } from '@/components/common/QueryStatus';

import { useParams } from 'next/navigation';
import { TripStatsView } from '@/components/stats';
import { useTripStats } from '@/hooks/queries';
import { StatsDashboardSkeleton } from '@/components/skeletons';

export default function TripStatsPage() {
  const params = useParams();
  const tripId = params.id as string;

  const query = useTripStats(tripId);
  const { data: stats, isLoading: loading } = query;

  if (loading) {
    return <StatsDashboardSkeleton />;
  }

  if (query.data === undefined) return <QueryStatus query={query} />;

  // 頁首由行程空間殼提供（分頁列已標示所在位置）
  return (
    <div className="container mx-auto max-w-6xl py-4 px-4 sm:px-6">
      <QueryStatus query={query} />
      {stats && <TripStatsView stats={stats} />}
    </div>
  );
}
