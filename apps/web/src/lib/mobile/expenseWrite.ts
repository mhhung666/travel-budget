import { ledgerOutput, currentLedger } from '@/lib/ledger';
import { readExpenseCreateRejection } from '@/lib/expenseCreateRequest';
import mongoose from 'mongoose';
import { RetiredBlobError } from '@/lib/blobReferences';
import { createExpenseForActor, type AfterResponse } from '@/lib/expenseCreate';
import { readExpenseCreateReceipt } from '@/lib/expenseCreateRequest';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { logger } from '@/lib/logger';
import { createExpenseSchema } from '@/lib/validation';
import { ApiError, readBody } from './http';
import { requireTripMember } from './access';
import { toMobileExpenseDetail } from './expenses';
import { clientRequestIdSchema, expenseCreateInput, expenseDetailSchema } from './contract';

const RETRY_AFTER_SECONDS = 1;

/**
 * Maps the shared service's failures onto the HTTP contract. 4xx always means nothing was written
 * for this request. 429 is a transaction that could not start or finish because of contention
 * (aborted, never committed). Anything else, including a lost commit acknowledgement, is
 * unexpected and surfaces as 5xx: the client must look the request up by its key.
 */
export function toExpenseWriteError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  if (error instanceof TripWriteError) {
    switch (error.code) {
      case 'VALIDATION_ERROR':
        return new ApiError(400, 'VALIDATION_ERROR');
      case 'CONFLICT':
        return new ApiError(409, 'IDEMPOTENCY_CONFLICT');
      // A member removed between authorization and commit gets the same answer as any outsider.
      case 'NOT_FOUND':
      case 'FORBIDDEN':
        return new ApiError(404, 'NOT_FOUND');
    }
  }
  if (error instanceof RetiredBlobError) return new ApiError(409, 'CONFLICT');
  const labelled = error as { hasErrorLabel?: (label: string) => boolean } | null;
  if (
    typeof labelled?.hasErrorLabel === 'function' &&
    labelled.hasErrorLabel('TransientTransactionError')
  ) {
    return new ApiError(429, 'BUSY', RETRY_AFTER_SECONDS);
  }
  return error;
}

/**
 * Authorizes first (a removed member learns nothing about earlier requests), then reads the body.
 * The first success and every replay of the same key and content return the same expense.
 */
export async function mobileCreateExpense(
  request: Request,
  userId: string,
  id: string,
  afterResponse: AfterResponse
) {
  const tripId = await requireTripMember(userId, id);
  const body = await readBody(request, expenseCreateInput);
  // The Web schema gives every creator the same field order and defaults, which the request
  // fingerprint depends on; a body the contract accepted always passes it.
  const parsed = createExpenseSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR');
  try {
    const created = await createExpenseForActor(
      { tripId, actorId: userId, input: parsed.data },
      afterResponse
    );
    return expenseDetailSchema.parse(toMobileExpenseDetail(created.data));
  } catch (error) {
    const mapped = toExpenseWriteError(error);
    // An unknown outcome must stay diagnosable: the response only carries a request id.
    if (!(mapped instanceof ApiError)) logger.error('Create expense error', error);
    throw mapped;
  }
}

/**
 * What the caller's own earlier request produced. Authorization is checked again, the lookup is
 * scoped to caller and trip, and an expense deleted since still counts as committed.
 */
export async function mobileExpenseRequest(userId: string, id: string, clientRequestId: string) {
  const tripId = await requireTripMember(userId, id);
  const key = clientRequestIdSchema.safeParse(clientRequestId);
  if (!key.success) throw new ApiError(400, 'VALIDATION_ERROR');
  const accepted = await readExpenseCreateReceipt(mongoose.connection.db!, {
    tripId,
    actorId: userId,
    clientRequestId: key.data,
  });
  const rejected = await readExpenseCreateRejection(mongoose.connection.db!, {
    tripId,
    actorId: userId,
    clientRequestId: key.data,
  });
  if (rejected) return { status: 'rejected' as const, code: rejected, ledger: currentLedger() };
  if (accepted)
    return { status: 'committed' as const, expense: ledgerOutput(toMobileExpenseDetail(accepted)) };
  return { status: 'not_found' as const };
}
