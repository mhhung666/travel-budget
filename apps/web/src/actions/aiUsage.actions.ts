'use server';

import { getAiUsageQuotaSummary } from '@/lib/ai/aiUsageQuota';
import { logger } from '@/lib/logger';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';

export type AiUsageSummary = {
  used_requests: number;
  request_limit: number;
  remaining_requests: number;
  resets_at: string;
};

/** Return only the signed-in user's daily shared AI request allowance. */
export const getAiUsageSummary = withAuth(
  async (session): Promise<ActionResult<AiUsageSummary>> => {
    try {
      const summary = await getAiUsageQuotaSummary({ userId: session.userId });
      return {
        success: true,
        data: {
          used_requests: summary.usedRequests,
          request_limit: summary.requestLimit,
          remaining_requests: summary.remainingRequests,
          resets_at: summary.resetsAt.toISOString(),
        },
      };
    } catch (error) {
      logger.error('Get AI usage summary error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
