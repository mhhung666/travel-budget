'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { TripWithMembers } from '@/types';
import { getTripCardStatus } from '@/lib/tripStatus';
import { rankTripList } from '@/lib/tripListOrder';
import TripCard from './TripCard';

interface TripListProps {
  trips: TripWithMembers[];
  onCopyCode: (code: string) => void;
  onToggleArchive?: (trip: TripWithMembers) => void;
  onQuickExpense?: (trip: TripWithMembers) => void;
  disabled?: boolean;
}

export default function TripList({
  trips,
  onCopyCode,
  onToggleArchive,
  onQuickExpense,
  disabled,
}: TripListProps) {
  const t = useTranslations('trips');

  // 依年份分組（年份取自 start_date）。trips 已按 start_date 新到舊排序、無日期者墊底，
  // 故順序掃描即可得到 2026 → 2025 → … → 未排定 的分組。
  // 旅行中與即將出發的旅行（UX #6）抽出置頂：旅行中在前，即將出發依出發日由近到遠。
  const groups = useMemo(() => {
    const current: { trip: TripWithMembers; rank: number }[] = [];
    const rest: TripWithMembers[] = [];
    const now = new Date();
    for (const trip of rankTripList(trips, now)) {
      const status = getTripCardStatus(trip, now);
      if (status.kind === 'ongoing') current.push({ trip, rank: -1 });
      else if (status.kind === 'upcoming') current.push({ trip, rank: status.daysUntil });
      else rest.push(trip);
    }
    current.sort((a, b) => a.rank - b.rank);

    const result: { key: string; label: string; trips: TripWithMembers[] }[] = [];
    if (current.length > 0) {
      result.push({
        key: 'current',
        label: t('currentGroup'),
        trips: current.map((entry) => entry.trip),
      });
    }
    for (const trip of rest) {
      const year = trip.start_date?.slice(0, 4) ?? null;
      const key = year === null ? 'no-date' : String(year);
      const last = result[result.length - 1];
      if (last && last.key === key) {
        last.trips.push(trip);
      } else {
        result.push({
          key,
          label: year === null ? t('noDateGroup') : String(year),
          trips: [trip],
        });
      }
    }
    return result;
  }, [trips, t]);

  if (!trips || trips.length === 0) {
    return null;
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="mb-4 text-lg font-semibold text-foreground">{group.label}</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {group.trips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                onCopyCode={onCopyCode}
                onToggleArchive={onToggleArchive}
                onQuickExpense={onQuickExpense}
                disabled={disabled}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
