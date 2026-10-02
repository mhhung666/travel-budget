'use server';
import { getTripMembership } from '@/lib/permissions';
import { readSettlement } from '@/lib/settlementRead';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { Settlement } from '@/types';
import { logger } from '@/lib/logger';
export const getSettlement = withAuth(
  async (session, id: string): Promise<ActionResult<Settlement>> => {
    try {
      const membership = await getTripMembership(session.userId, id);
      if (!membership) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      return { success: true, data: await readSettlement(membership.tripId) };
    } catch (error) {
      logger.error('Get settlement error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
