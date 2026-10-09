'use server';

import { withLedgerAuth as withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { TripLanding } from '@/types/tripLanding';
import { readTripLanding } from '@/lib/tripLandingRead';
import { logger } from '@/lib/logger';

export const getLedgerTripLanding = withAuth(
  async (session, id: string, viewerDate?: string): Promise<ActionResult<TripLanding>> => {
    try {
      const data = await readTripLanding(id, session.userId, viewerDate);
      return data
        ? { success: true, data }
        : { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    } catch (error) {
      logger.error('Get trip landing error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
