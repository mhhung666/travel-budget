import { NextRequest, NextResponse } from 'next/server';
import { Trip } from '@/models';
import { getTripIdByHashCode } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { PublicApiError, apiError } from '@/lib/publicApiError';

type LeanTrip = {
  _id: { toString(): string };
  name: string;
  description?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  location?: unknown;
  hashCode: string;
  createdAt: Date;
};

// 公開獲取旅行詳情（不需登入）
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // 支援 hash_code 或 ObjectId
    const tripId = await getTripIdByHashCode(id);
    if (!tripId) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }

    const trip = await Trip.findById(tripId)
      .select('name description startDate endDate location hashCode createdAt')
      .lean<LeanTrip>();

    if (!trip) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }

    return NextResponse.json({
      trip: {
        id: trip._id.toString(),
        name: trip.name,
        description: trip.description ?? null,
        start_date: trip.startDate ? trip.startDate.toISOString().slice(0, 10) : null,
        end_date: trip.endDate ? trip.endDate.toISOString().slice(0, 10) : null,
        location: trip.location ?? null,
        hash_code: trip.hashCode,
        created_at: trip.createdAt.toISOString(),
        // 公開（唯讀分享）情境無個別封存概念，固定為 null
        archived_at: null,
      },
    });
  } catch (error) {
    logger.error('Get public trip error', error);
    return apiError(PublicApiError.INTERNAL_ERROR, 500);
  }
}
