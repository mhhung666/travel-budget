'use server';
import { getTripMembership } from '@/lib/permissions';
import { readWebPaymentContext } from '@/lib/paymentWrite';
import { getEnv } from '@/lib/env';
import mongoose from 'mongoose';
import { withLedgerAuth as withAuth, withLegacyTripRead } from './withAuth';
import type { ActionResult } from './types';
import type { Settlement } from '@/types';
import { logger } from '@/lib/logger';
export const getLedgerSettlement = withAuth(
  async (session, id: string): Promise<ActionResult<Settlement>> => {
    try {
      const membership = await getTripMembership(session.userId, id);
      if (!membership) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      return {
        success: true,
        data: await readWebPaymentContext(
          mongoose.connection.db!,
          session.userId,
          membership.tripId,
          getEnv().JWT_SECRET
        ),
      };
    } catch (error) {
      logger.error('Get settlement error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

export const getSettlement = withLegacyTripRead(getLedgerSettlement);
