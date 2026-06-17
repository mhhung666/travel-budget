'use client';

import { useRouter } from '@/i18n/navigation';
import type { TripWithMembers } from '@/types';
import TripCard from './TripCard';

interface TripListProps {
  trips: TripWithMembers[];
  onCopyCode: (code: string) => void;
  onToggleArchive?: (trip: TripWithMembers) => void;
}

export default function TripList({ trips, onCopyCode, onToggleArchive }: TripListProps) {
  const router = useRouter();

  if (!trips || trips.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {trips.map((trip) => (
        <TripCard
          key={trip.id}
          trip={trip}
          onClick={() => router.push(`/trips/${trip.hash_code}`)}
          onCopyCode={onCopyCode}
          onToggleArchive={onToggleArchive}
        />
      ))}
    </div>
  );
}
