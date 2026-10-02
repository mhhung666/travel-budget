import { NextRequest, NextResponse } from 'next/server';
import { readTripLanding } from '@/lib/tripLandingRead';
import { apiError, PublicApiError } from '@/lib/publicApiError';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await readTripLanding(
      id,
      undefined,
      request.nextUrl.searchParams.get('date') ?? undefined
    );
    return data ? NextResponse.json(data) : apiError(PublicApiError.NOT_FOUND, 404);
  } catch (error) {
    logger.error('Get public trip landing error', error);
    return apiError(PublicApiError.INTERNAL_ERROR, 500);
  }
}
