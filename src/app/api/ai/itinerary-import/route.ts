import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSessionFromRequest } from '@/lib/auth';
import { countImportCharacters, ITINERARY_IMPORT_LIMITS } from '@/lib/ai/importLimits';
import { loadItineraryImportContext } from '@/lib/ai/itineraryImportContext';
import {
  itineraryImportRequestSchema,
  type ItineraryImportErrorCode,
} from '@/lib/ai/itineraryImportSchema';
import {
  ItineraryImportProviderError,
  parseItineraryImport,
} from '@/lib/ai/itineraryImportProvider';
import { normalizeItineraryImport } from '@/lib/ai/normalizeItineraryImport';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A JSON string may encode one source character as a six-character `\uXXXX` escape.
const MAX_REQUEST_BODY_CHARACTERS = ITINERARY_IMPORT_LIMITS.sourceCharacters * 6 + 2_000;

const ERROR_STATUS: Record<ItineraryImportErrorCode, number> = {
  UNAUTHENTICATED: 401,
  TRIP_NOT_FOUND: 404,
  FORBIDDEN: 403,
  FEATURE_DISABLED: 503,
  INVALID_REQUEST: 400,
  SOURCE_TOO_LONG: 413,
  RATE_LIMITED: 429,
  PROVIDER_TIMEOUT: 504,
  INVALID_MODEL_OUTPUT: 502,
  MODEL_OUTPUT_LIMIT: 502,
  INTERNAL_ERROR: 500,
};

function errorResponse(code: ItineraryImportErrorCode) {
  return NextResponse.json(
    { success: false, error: { code, message: code } },
    { status: ERROR_STATUS[code] }
  );
}

function sourceTooLong(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    countImportCharacters(value.trim()) > ITINERARY_IMPORT_LIMITS.sourceCharacters
  );
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const session = await getSessionFromRequest(request);
  if (!session) return errorResponse('UNAUTHENTICATED');

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (countImportCharacters(rawBody) > MAX_REQUEST_BODY_CHARACTERS) {
      return errorResponse('SOURCE_TOO_LONG');
    }
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse('INVALID_REQUEST');
  }

  if (body && typeof body === 'object' && sourceTooLong(Reflect.get(body, 'sourceText'))) {
    return errorResponse('SOURCE_TOO_LONG');
  }

  const requestInput = itineraryImportRequestSchema.safeParse(body);
  if (!requestInput.success) return errorResponse('INVALID_REQUEST');

  let contextResult: Awaited<ReturnType<typeof loadItineraryImportContext>>;
  try {
    contextResult = await loadItineraryImportContext(session.userId, requestInput.data.tripId);
  } catch {
    logger.warn('AI itinerary import context failed', {
      latencyMs: Date.now() - startedAt,
      status: 'error',
      errorCode: 'INTERNAL_ERROR',
    });
    return errorResponse('INTERNAL_ERROR');
  }
  if (contextResult.status === 'forbidden') return errorResponse('FORBIDDEN');
  if (contextResult.status === 'not_found') return errorResponse('TRIP_NOT_FOUND');

  try {
    const generation = await parseItineraryImport({
      sourceText: requestInput.data.sourceText,
      context: contextResult.context,
    });
    const draft = normalizeItineraryImport(generation.draft, contextResult.context);

    logger.info('AI itinerary import parsed', {
      provider: generation.provider,
      model: generation.model,
      latencyMs: Date.now() - startedAt,
      inputTokens: generation.usage.inputTokens,
      outputTokens: generation.usage.outputTokens,
      totalTokens: generation.usage.totalTokens,
      status: 'success',
    });

    return NextResponse.json({ success: true, draft });
  } catch (error) {
    const code: ItineraryImportErrorCode =
      error instanceof ItineraryImportProviderError
        ? error.code
        : error instanceof ZodError
          ? 'INVALID_MODEL_OUTPUT'
          : 'INTERNAL_ERROR';
    logger.warn('AI itinerary import failed', {
      latencyMs: Date.now() - startedAt,
      status: 'error',
      errorCode: code,
    });
    return errorResponse(code);
  }
}
