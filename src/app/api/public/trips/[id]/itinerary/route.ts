import { NextRequest, NextResponse } from 'next/server';
import { ItineraryDay } from '@/models';
import { getTripIdByHashCode } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { PublicApiError, apiError } from '@/lib/publicApiError';

type LeanDay = {
  _id: { toString(): string };
  trip: { toString(): string };
  dayNumber: number;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Public API to get itinerary for a trip
 * Anyone can view the itinerary (no auth required)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tripId = await getTripIdByHashCode(id);

    if (!tripId) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }

    const days = await ItineraryDay.find({ trip: tripId }).sort({ dayNumber: 1 }).lean<LeanDay[]>();

    const itinerary = days.map((d) => ({
      id: d._id.toString(),
      trip_id: d.trip.toString(),
      day_number: d.dayNumber,
      title: d.title,
      content: d.content,
      created_at: d.createdAt.toISOString(),
      updated_at: d.updatedAt.toISOString(),
    }));

    return NextResponse.json({ itinerary });
  } catch (error) {
    logger.error('Get public itinerary error', error);
    return apiError(PublicApiError.INTERNAL_ERROR, 500);
  }
}
