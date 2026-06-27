import { NextResponse } from 'next/server';
import { ItineraryDay } from '@/models';
import { withPublicTrip } from '@/lib/withPublicTrip';
import type { Location } from '@/types';

type LeanActivity = {
  _id: { toString(): string };
  time?: string | null;
  endTime?: string | null;
  title: string;
  type: string;
  location?: Location | null;
  note?: string;
  confirmationCode?: string;
};

type LeanDay = {
  _id: { toString(): string };
  trip: { toString(): string };
  dayNumber: number;
  title: string;
  content: string;
  location?: Location | null;
  activities?: LeanActivity[];
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
      // confirmationCode（訂位/票券碼）與 attachments（票券附件）皆為敏感資訊，
      // 刻意不外洩到公開分享頁（比照收據不外洩）。
      activities: (d.activities ?? []).map((a) => ({
        id: a._id.toString(),
        time: a.time ?? null,
        end_time: a.endTime ?? null,
        title: a.title,
        type: a.type,
        location: a.location ?? null,
        note: a.note ?? '',
        confirmation_code: '',
        attachments: [],
      })),
      created_at: d.createdAt.toISOString(),
      updated_at: d.updatedAt.toISOString(),
    }));

    return NextResponse.json({ itinerary });
  },
  { logLabel: 'Get public itinerary error' }
);
