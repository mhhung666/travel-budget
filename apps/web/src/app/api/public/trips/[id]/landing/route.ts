import { LedgerError } from '@/lib/ledger';
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
    if (error instanceof LedgerError && error.code === 'CLIENT_UPGRADE_REQUIRED')
      return apiError(PublicApiError.CLIENT_UPGRADE_REQUIRED, 409);
    if (error instanceof LedgerError && error.code === 'LEDGER_DATA_INVALID')
      return apiError(PublicApiError.LEDGER_DATA_INVALID, 503);
    logger.error('Get public trip landing error', error);
    return apiError(PublicApiError.INTERNAL_ERROR, 500);
  }
}
