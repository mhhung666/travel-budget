import { NextResponse } from 'next/server';
import { Trip } from '@/models';
import { PublicApiError, apiError } from '@/lib/publicApiError';
import { withPublicTrip } from '@/lib/withPublicTrip';
import { toTripDto, type TripDtoInput } from '@/lib/dto';

// 公開獲取旅行詳情（不需登入）
export const GET = withPublicTrip(
  async ({ tripId }) => {
    const trip = await Trip.findById(tripId)
      .select('name description startDate endDate location hashCode createdAt')
      .lean<TripDtoInput>();

    if (!trip) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }

    // 與 actions 的 getTrip 共用映射；不傳 viewerId，archived_at 固定 null
    // （公開唯讀分享情境無個別封存概念）。
    return NextResponse.json({ trip: toTripDto(trip) });
  },
  { logLabel: 'Get public trip error' }
);
