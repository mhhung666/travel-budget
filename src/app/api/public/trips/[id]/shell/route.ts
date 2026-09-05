import { NextResponse } from 'next/server';
import { Trip } from '@/models';
import { withPublicTrip } from '@/lib/withPublicTrip';
import { apiError, PublicApiError } from '@/lib/publicApiError';
import { readTripShell, type LeanTripShell } from '@/lib/tripShellRead';
export const GET = withPublicTrip(
  async ({ tripId }) => {
    const trip = await Trip.findById(tripId)
      .select('name startDate endDate hashCode members.user currencySettings')
      .lean<LeanTripShell | null>();
    if (!trip) return apiError(PublicApiError.NOT_FOUND, 404);
    return NextResponse.json({ shell: await readTripShell(trip) });
  },
  { logLabel: 'Get public trip shell error' }
);
