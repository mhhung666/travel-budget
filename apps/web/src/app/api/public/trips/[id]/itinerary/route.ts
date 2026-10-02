import { NextResponse } from 'next/server';
import { withPublicTrip } from '@/lib/withPublicTrip';
import { readItinerary } from '@/lib/itineraryRead';
export const GET = withPublicTrip(
  async ({ tripId }) => NextResponse.json({ itinerary: await readItinerary(tripId, false) }),
  { logLabel: 'Get public itinerary error' }
);
