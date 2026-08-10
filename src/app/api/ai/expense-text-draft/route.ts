import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSessionFromRequest } from '@/lib/auth';
import { getTripMembership } from '@/lib/permissions';
import { Trip, User } from '@/models';
import { expenseTextDraftRequestSchema } from '@/lib/ai/expenseTextDraftSchema';
import { normalizeExpenseTextDraft } from '@/lib/ai/normalizeExpenseTextDraft';
import { parseExpenseTextDraft } from '@/lib/ai/expenseTextDraftProvider';
import { AiProviderError, type AiProviderErrorCode } from '@/lib/ai/aiProvider';
import {
  AiUsageQuotaError,
  reserveAiUsageQuota,
  settleAiUsageQuota,
  type AiUsageQuotaReservation,
} from '@/lib/ai/aiUsageQuota';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'TRIP_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'USAGE_LIMITED'
  | AiProviderErrorCode;

const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  TRIP_NOT_FOUND: 404,
  INVALID_REQUEST: 400,
  USAGE_LIMITED: 429,
  FEATURE_DISABLED: 503,
  RATE_LIMITED: 429,
  PROVIDER_TIMEOUT: 504,
  INVALID_MODEL_OUTPUT: 502,
  MODEL_OUTPUT_LIMIT: 502,
  INTERNAL_ERROR: 500,
};

function errorResponse(code: ErrorCode) {
  return NextResponse.json(
    { success: false, error: { code, message: code } },
    { status: ERROR_STATUS[code] }
  );
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const session = await getSessionFromRequest(request);
  if (!session) return errorResponse('UNAUTHENTICATED');

  const input = expenseTextDraftRequestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return errorResponse('INVALID_REQUEST');

  let membership: Awaited<ReturnType<typeof getTripMembership>>;
  try {
    membership = await getTripMembership(session.userId, input.data.tripId);
  } catch {
    return errorResponse('INTERNAL_ERROR');
  }
  if (!membership) return errorResponse('FORBIDDEN');

  let members: Array<{ id: string; displayName: string; username: string }>;
  try {
    const trip = await Trip.findById(membership.tripId).select('members').lean();
    if (!trip) return errorResponse('TRIP_NOT_FOUND');
    const users = await User.find({ _id: { $in: trip.members.map((member) => member.user) } })
      .select('_id displayName username')
      .lean();
    members = users.map((user) => ({
      id: user._id.toString(),
      displayName: user.displayName,
      username: user.username,
    }));
  } catch {
    return errorResponse('INTERNAL_ERROR');
  }

  let quotaReservation: AiUsageQuotaReservation;
  try {
    quotaReservation = await reserveAiUsageQuota({
      userId: session.userId,
      tripId: membership.tripId,
    });
  } catch (error) {
    const code = error instanceof AiUsageQuotaError ? error.code : 'INTERNAL_ERROR';
    logger.warn('AI expense text draft quota rejected', {
      latencyMs: Date.now() - startedAt,
      status: 'error',
      errorCode: code,
    });
    return errorResponse(code);
  }

  try {
    const generation = await parseExpenseTextDraft(input.data.sourceText);
    const draft = normalizeExpenseTextDraft(generation.draft, members, session.userId);
    let costMicroUsd: number | undefined;
    try {
      costMicroUsd = (
        await settleAiUsageQuota(quotaReservation, {
          success: true,
          usage: generation.usage,
        })
      ).costMicroUsd;
    } catch {
      logger.warn('AI expense text draft metering failed', {
        latencyMs: Date.now() - startedAt,
        status: 'error',
        errorCode: 'INTERNAL_ERROR',
      });
    }
    logger.info('AI expense text draft parsed', {
      provider: generation.provider,
      model: generation.model,
      latencyMs: Date.now() - startedAt,
      inputTokens: generation.usage.inputTokens,
      outputTokens: generation.usage.outputTokens,
      totalTokens: generation.usage.totalTokens,
      costMicroUsd,
      status: 'success',
    });
    return NextResponse.json({ success: true, draft });
  } catch (error) {
    const code: ErrorCode =
      error instanceof AiProviderError
        ? error.code
        : error instanceof ZodError
          ? 'INVALID_MODEL_OUTPUT'
          : 'INTERNAL_ERROR';
    await settleAiUsageQuota(quotaReservation, { success: false }).catch(() => undefined);
    logger.warn('AI expense text draft failed', {
      latencyMs: Date.now() - startedAt,
      status: 'error',
      errorCode: code,
    });
    return errorResponse(code);
  }
}
