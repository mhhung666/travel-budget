'use client';

import { Box } from '@mui/material';
import { useRouter } from '@/i18n/navigation';
import type { TripWithMembers } from '@/types';
import TripCard from './TripCard';

interface TripListProps {
    trips: TripWithMembers[];
    onCopyCode: (code: string) => void;
}

export default function TripList({ trips, onCopyCode }: TripListProps) {
    const router = useRouter();

    if (!trips || trips.length === 0) {
        return null;
    }

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                gap: 2,
            }}
        >
            {trips.map((trip) => (
                <TripCard
                    key={trip.id}
                    trip={trip}
                    onClick={() => router.push(`/trips/${trip.hash_code}`)}
                    onCopyCode={onCopyCode}
                />
            ))}
        </Box>
    );
}
