import { NextResponse } from 'next/server';
import { ItineraryDay } from '@/models';
import { withPublicTrip } from '@/lib/withPublicTrip';
import type { Location } from '@/types';

type LeanDay = {
  _id: { toString(): string };
  trip: { toString(): string };
  dayNumber: number;
  title: string;
  content: string;
  location?: Location | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Public API to get itinerary for a trip
 * Anyone can view the itinerary (no auth required)
 */
export const GET = withPublicTrip(
  async ({ tripId }) => {
    const days = await ItineraryDay.find({ trip: tripId }).sort({ dayNumber: 1 }).lean<LeanDay[]>();

    const itinerary = days.map((d) => ({
      id: d._id.toString(),
      trip_id: d.trip.toString(),
      day_number: d.dayNumber,
      title: d.title,
      content: d.content,
      location: d.location ?? null,
      created_at: d.createdAt.toISOString(),
      updated_at: d.updatedAt.toISOString(),
    }));

    return NextResponse.json({ itinerary });
  },
  { logLabel: 'Get public itinerary error' }
);
