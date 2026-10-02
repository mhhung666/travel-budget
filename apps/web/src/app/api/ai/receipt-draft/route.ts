import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSessionFromRequest } from '@/lib/auth';
import { getTripMembership } from '@/lib/permissions';
import { getObjectBuffer, headObject } from '@/lib/storage';
import { isReceiptKeyForTrip, validateUpload } from '@/lib/uploads';
import { receiptDraftRequestSchema } from '@/lib/ai/receiptDraftSchema';
import { normalizeReceiptDraft } from '@/lib/ai/normalizeReceiptDraft';
import { parseReceiptDraft } from '@/lib/ai/receiptDraftProvider';
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
  | 'INVALID_REQUEST'
  | 'INVALID_IMAGE'
  | 'USAGE_LIMITED'
  | AiProviderErrorCode;

const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_REQUEST: 400,
  INVALID_IMAGE: 400,
  USAGE_LIMITED: 429,
  FEATURE_DISABLED: 503,
  RATE_LIMITED: 429,
  PROVIDER_TIMEOUT: 504,
  INVALID_MODEL_OUTPUT: 502,
  MODEL_OUTPUT_LIMIT: 502,
  INTERNAL_ERROR: 500,
};

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

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

  const parsed = receiptDraftRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse('INVALID_REQUEST');

  let membership: Awaited<ReturnType<typeof getTripMembership>>;
  try {
    membership = await getTripMembership(session.userId, parsed.data.tripId);
  } catch {
    return errorResponse('INTERNAL_ERROR');
  }
  if (!membership) return errorResponse('FORBIDDEN');
  if (!isReceiptKeyForTrip(membership.tripId, parsed.data.key)) {
    return errorResponse('INVALID_REQUEST');
  }

  let head: Awaited<ReturnType<typeof headObject>>;
  let bytes: Buffer | null;
  try {
    head = await headObject('receipts', parsed.data.key);
    if (
      !head ||
      !imageTypes.has(head.contentType) ||
      !validateUpload('receipt', head.contentType, head.size).ok
    ) {
      return errorResponse('INVALID_IMAGE');
    }
    bytes = await getObjectBuffer('receipts', parsed.data.key);
  } catch {
    return errorResponse('INTERNAL_ERROR');
  }
  if (!bytes) return errorResponse('INVALID_IMAGE');

  let quotaReservation: AiUsageQuotaReservation;
  try {
    quotaReservation = await reserveAiUsageQuota({
      userId: session.userId,
      tripId: membership.tripId,
    });
  } catch (error) {
    const code = error instanceof AiUsageQuotaError ? error.code : 'INTERNAL_ERROR';
    logger.warn('AI receipt draft quota rejected', {
      latencyMs: Date.now() - startedAt,
      status: 'error',
      errorCode: code,
    });
    return errorResponse(code);
  }

  try {
    const generation = await parseReceiptDraft(
      bytes,
      head.contentType as 'image/jpeg' | 'image/png' | 'image/webp'
    );
    const draft = normalizeReceiptDraft(generation.draft);
    let costMicroUsd: number | undefined;
    try {
      costMicroUsd = (
        await settleAiUsageQuota(quotaReservation, {
          success: true,
          usage: generation.usage,
        })
      ).costMicroUsd;
    } catch {
      logger.warn('AI receipt draft metering failed', {
        latencyMs: Date.now() - startedAt,
        status: 'error',
        errorCode: 'INTERNAL_ERROR',
      });
    }
    logger.info('AI receipt draft parsed', {
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
    logger.warn('AI receipt draft failed', {
      latencyMs: Date.now() - startedAt,
      status: 'error',
      errorCode: code,
    });
    return errorResponse(code);
  }
}
