import { ItineraryDay } from '@/models';
import type { Activity as ActivityDto, ItineraryDay as ItineraryDayDto, Location } from '@/types';
type LeanAttachment = {
  key: string;
  contentType: string;
  size: number;
  uploadedBy: { toString(): string };
  uploadedAt: Date;
};

export type LeanActivity = {
  _id: { toString(): string };
  time?: string | null;
  endTime?: string | null;
  title: string;
  type: ActivityDto['type'];
  location?: Location | null;
  locationName?: string;
  note?: string;
  confirmationCode?: string;
  attachments?: LeanAttachment[];
};

export type LeanDay = {
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

function toActivityDto(a: LeanActivity): ActivityDto {
  return {
    id: a._id.toString(),
    time: a.time ?? null,
    end_time: a.endTime ?? null,
    title: a.title,
    type: a.type,
    location: a.location ?? null,
    location_name: a.locationName ?? '',
    note: a.note ?? '',
    confirmation_code: a.confirmationCode ?? '',
    // 只帶 key + 中繼資料（不含 url）；檢視時走 getItineraryAttachmentUrl 簽短效 GET。
    attachments: (a.attachments ?? []).map((at) => ({
      key: at.key,
      content_type: at.contentType,
      size: at.size,
    })),
  };
}

export function toDayDto(d: LeanDay, privateFields = true): ItineraryDayDto {
  return {
    id: d._id.toString(),
    trip_id: d.trip.toString(),
    day_number: d.dayNumber,
    title: d.title,
    content: d.content,
    location: d.location ?? null,
    activities: (d.activities ?? []).map((a) => {
      const dto = toActivityDto(a);
      return privateFields ? dto : { ...dto, confirmation_code: '', attachments: [] };
    }),
    created_at: d.createdAt.toISOString(),
    updated_at: d.updatedAt.toISOString(),
  };
}

export async function readItinerary(
  tripId: string,
  privateFields: boolean
): Promise<ItineraryDayDto[]> {
  const days = await ItineraryDay.find({ trip: tripId }).sort({ dayNumber: 1 }).lean<LeanDay[]>();
  return days.map((day) => toDayDto(day, privateFields));
}
