import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { MoneyTotalError } from '@/lib/money';
import { LedgerError, ledgerInputSchema, parseLedgerInput } from '@/lib/ledger';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfter?: number
  ) {
    super(code);
  }
}
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new ApiError(415, 'INVALID_CONTENT_TYPE');
  // Bound bytes even when Content-Length is absent (chunked requests).
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'VALIDATION_ERROR');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new ApiError(413, 'BODY_TOO_LARGE');
      }
      chunks.push(chunk.value);
    }
    const raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const data = ledgerInputSchema(schema).safeParse(raw);
    if (!data.success) throw new ApiError(400, 'VALIDATION_ERROR');
    return parseLedgerInput(schema, raw);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'VALIDATION_ERROR');
  } finally {
    reader.releaseLock();
  }
}
export async function apiResponse(operation: () => Promise<unknown>): Promise<Response> {
  const requestId = randomUUID();
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Request-Id': requestId,
    Vary: 'Authorization',
  };
  try {
    return Response.json({ data: await operation() }, { headers });
  } catch (error) {
    const failure =
      error instanceof MoneyTotalError
        ? new ApiError(503, 'MONEY_TOTAL_OUT_OF_RANGE')
        : error instanceof LedgerError
          ? new ApiError(
              error.code === 'VALIDATION_ERROR'
                ? 400
                : ['LEDGER_DATA_INVALID', 'MONEY_TOTAL_OUT_OF_RANGE'].includes(error.code)
                  ? 503
                  : 409,
              error.code
            )
          : error;
    const known = failure instanceof ApiError;
    if (!known) logger.error('Mobile API request failed', { requestId });
    if (known && failure.retryAfter) headers['Retry-After'] = String(failure.retryAfter);
    return Response.json(
      { error: { code: known ? failure.code : 'INTERNAL_ERROR' }, requestId },
      { status: known ? failure.status : 500, headers }
    );
  }
}
