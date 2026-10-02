import { ItineraryDay, Photo } from '@/models';
import { dayDateFromTrip, isTripDayOutsideRange } from '@/lib/collectionImport';

type DayId = { toString(): string };

export type PhotoItineraryDay = {
  _id: DayId;
  dayNumber: number;
  location?: { lat?: number | null; lon?: number | null } | null;
};

type AutoPhoto = {
  _id: DayId;
  takenLocalDate?: string | null;
  location?: { source?: string | null } | null;
};

/** 建立「拍攝當地日期 → 行程日」索引；超出旅程結束日的 Day 不參與自動分類。 */
export function buildItineraryDayDateMap(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  days: PhotoItineraryDay[]
): Map<string, PhotoItineraryDay> {
  const start = startDate instanceof Date ? startDate.toISOString().slice(0, 10) : startDate;
  const end = endDate instanceof Date ? endDate.toISOString().slice(0, 10) : endDate;
  const map = new Map<string, PhotoItineraryDay>();
  for (const day of days) {
    const date = dayDateFromTrip(start, day.dayNumber);
    if (date && !isTripDayOutsideRange(date, end)) map.set(date, day);
  }
  return map;
}

function borrowedLocation(
  day: PhotoItineraryDay | undefined
): { lat: number; lon: number; source: 'itinerary' } | null {
  const { lat, lon } = day?.location ?? {};
  return typeof lat === 'number' && typeof lon === 'number'
    ? { lat, lon, source: 'itinerary' }
    : null;
}

/**
 * 依相片的當地拍攝日期重算所有 auto 關聯。只改 `itineraryDaySource: auto`：
 * 手動選日或手動設為未分類的照片不會被旅程日期更新覆蓋。
 */
export async function rebindAutoPhotosToItinerary(
  tripId: string,
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined
): Promise<void> {
  const [days, photos] = await Promise.all([
    ItineraryDay.find({ trip: tripId })
      .sort({ dayNumber: 1 })
      .select('_id dayNumber location')
      .lean<PhotoItineraryDay[]>(),
    Photo.find({ trip: tripId, itineraryDaySource: 'auto' })
      .select('_id takenLocalDate location')
      .lean<AutoPhoto[]>(),
  ]);

  if (photos.length === 0) return;
  const byDate = buildItineraryDayDateMap(startDate, endDate, days);
  const ops = photos.map((photo) => {
    const day = photo.takenLocalDate ? byDate.get(photo.takenLocalDate) : undefined;
    const set: Record<string, unknown> = {
      itineraryDay: day?._id ?? null,
      itineraryDaySource: 'auto',
    };
    // EXIF／手動座標比行程日精確，不覆蓋；無座標或借自舊行程日的座標跟著新關聯移動。
    if (!photo.location || photo.location.source === 'itinerary') {
      set.location = borrowedLocation(day);
    }
    return {
      updateOne: {
        filter: { _id: photo._id, trip: tripId, itineraryDaySource: 'auto' as const },
        update: { $set: set },
      },
    };
  });

  await Photo.bulkWrite(ops, { ordered: false });
}

/** 上傳入庫時使用：找出一張相片的自動關聯日與可借用的行程日座標。 */
export function autoItineraryFields(
  takenLocalDate: string | null | undefined,
  daysByDate: Map<string, PhotoItineraryDay>
): {
  itineraryDay: DayId | null;
  itineraryDaySource: 'auto' | null;
  borrowedLocation: { lat: number; lon: number; source: 'itinerary' } | null;
} {
  if (!takenLocalDate) {
    return { itineraryDay: null, itineraryDaySource: null, borrowedLocation: null };
  }
  const day = daysByDate.get(takenLocalDate);
  return {
    itineraryDay: day?._id ?? null,
    // 即使目前沒有相符 Day 仍標 auto，之後新增行程日或延長日期時才能自動補綁。
    itineraryDaySource: 'auto',
    borrowedLocation: borrowedLocation(day),
  };
}
