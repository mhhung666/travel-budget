'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { createExpenseForActor } from '@/lib/expenseCreate';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { RetiredBlobError } from '@/lib/blobReferences';
import { Expense } from '@/models';
import {
  updateExpenseForActor,
  deleteExpenseForActor,
  webExpenseRevision,
} from '@/lib/expenseMaintenance';
import { getEnv } from '@/lib/env';
import { getMemberTrip, getTripMembership } from '@/lib/permissions';
import {
  createExpenseSchema,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from '@/lib/validation';
import { withAuth as legacyAuth, withLedgerAuth as withAuth, withLegacyTripRead } from './withAuth';
import { isLedgerV2, withLedgerV2, parseLedgerInput, ledgerActionFailure } from '@/lib/ledger';
import type { ActionResult } from './types';
import type { Expense as ExpenseDto } from '@/types';
import { logger } from '@/lib/logger';
import { toExpenseDto, type ExpenseDtoInput } from '@/lib/dto';
import { isReceiptKeyForTrip } from '@/lib/uploads';
import { presignGet } from '@/lib/storage';

type LeanExpense = ExpenseDtoInput & { date: Date };

/**
 * Get all expenses for a trip
 */
export const getLedgerExpenses = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<ExpenseDto[]>> => {
    try {
      const parent = await getMemberTrip(session.userId, tripIdOrCode, 'members baseCurrency');
      if (!parent) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      const { tripId } = parent.membership;

      // splits 已內嵌，payer 與 splits.user 一次 populate，徹底消除原本的 N+1
      const expenses = await Expense.find({ trip: tripId })
        .sort({ date: -1, createdAt: -1 })
        .lean<LeanExpense[]>();
      // Capture raw identities before populate replaces a historical missing user with null.
      const revisions = new Map(
        expenses.map((e) => [
          e._id.toString(),
          webExpenseRevision(getEnv().JWT_SECRET, tripId, e, parent.trip.members),
        ])
      );
      await Expense.populate(expenses, [
        { path: 'payer', select: 'username displayName' },
        { path: 'splits.user', select: 'username displayName' },
      ]);
      const data = expenses.map((e) => ({
        ...toExpenseDto(e, tripId),
        revision: revisions.get(e._id.toString())!,
      }));
      return { success: true, data };
    } catch (error) {
      const failure = ledgerActionFailure(error);
      if (failure) return failure;
      logger.error('Get expenses error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** Lightweight autocomplete metadata for the expense form. */
export const getExpenseTags = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<string[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const tags = await Expense.distinct('tags', { trip: membership.tripId });
      return {
        success: true,
        data: tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0).sort(),
      };
    } catch (error) {
      const failure = ledgerActionFailure(error);
      if (failure) return failure;
      logger.error('Get expense tags error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Create a new expense. This is the cookie adapter: it authenticates, resolves the trip, parses the
 * input and owns Next.js cache invalidation. The write itself lives in `lib/expenseCreate.ts`,
 * shared with the native HTTP API.
 */
export const createExpense = legacyAuth(
  async (
    session,
    tripIdOrCode: string,
    input: CreateExpenseInput
  ): Promise<ActionResult<ExpenseDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const { tripId } = membership;

      const validation = (
        isLedgerV2()
          ? createExpenseSchema.extend({
              base_currency: createExpenseSchema.shape.currency,
              client_request_id: createExpenseSchema.shape.client_request_id.unwrap(),
              exchange_rate: createExpenseSchema.shape.exchange_rate.removeDefault(),
            })
          : createExpenseSchema
      ).safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const created = await createExpenseForActor(
        { tripId, actorId: session.userId, input: validation.data },
        (task) => after(task)
      );
      if (created.replayed) return { success: true, data: created.data };
      try {
        revalidatePath(`/trips/${tripIdOrCode}/expenses`);
      } catch {
        // The expense is committed; a cache failure must not be reported as a failed creation.
        logger.error('Create expense cache invalidation failed');
      }
      return { success: true, data: created.data };
    } catch (error) {
      const failure = ledgerActionFailure(error);
      if (failure) return failure;
      if (error instanceof RetiredBlobError)
        return { success: false, error: error.code, code: error.code };
      if (error instanceof TripWriteError)
        return { success: false, error: error.code, code: error.code };
      if (
        isLedgerV2() &&
        (error as { hasErrorLabel?: (label: string) => boolean })?.hasErrorLabel?.(
          'TransientTransactionError'
        )
      )
        return { success: false, error: 'BUSY', code: 'BUSY', retryAfter: 1 };
      logger.error('Create expense error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Update an expense
 */
export const updateExpense = legacyAuth(
  async (
    session,
    tripIdOrCode: string,
    expenseId: string,
    input: UpdateExpenseInput
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      const result = await updateExpenseForActor(
        session.userId,
        membership.tripId,
        expenseId,
        input
      );
      if (result.success) {
        try {
          revalidatePath(`/trips/${tripIdOrCode}/expenses`);
        } catch {
          /* committed */
        }
      }
      return result;
    } catch (error) {
      const failure = ledgerActionFailure(error);
      if (failure) return failure;
      logger.error('updateExpense adapter error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Delete an expense
 */
export const deleteExpense = legacyAuth(
  async (
    session,
    tripIdOrCode: string,
    expenseId: string
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      const result = await deleteExpenseForActor(session.userId, membership.tripId, expenseId);
      if (result.success) {
        try {
          revalidatePath(`/trips/${tripIdOrCode}/expenses`);
        } catch {
          /* committed */
        }
      }
      return result;
    } catch (error) {
      const failure = ledgerActionFailure(error);
      if (failure) return failure;
      logger.error('deleteExpense adapter error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Sign a short-lived GET URL for a receipt. Membership-gated, and the key must
 * belong to this trip — so a member of one trip can't sign another trip's
 * receipt even if they learn its key.
 */
export const getReceiptUrl = withAuth(
  async (session, tripIdOrCode: string, key: string): Promise<ActionResult<{ url: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (!isReceiptKeyForTrip(membership.tripId, key)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const url = await presignGet('receipts', key);
      return { success: true, data: { url } };
    } catch (error) {
      const failure = ledgerActionFailure(error);
      if (failure) return failure;
      logger.error('getReceiptUrl error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** Separate action identity for confirmed v2 bodies; old queues keep createExpense. */
export async function createLedgerExpense(id: string, input: CreateExpenseInput) {
  return withLedgerV2(() => createExpense(id, input));
}

export const deleteLedgerExpense = withAuth(
  async (
    session,
    id: string,
    expenseId: string,
    body: { client_request_id: string; expected_revision: string; base_currency: string }
  ) => {
    const member = await getTripMembership(session.userId, id);
    if (!member) return { success: false as const, error: 'NOT_FOUND', code: 'NOT_FOUND' as const };
    const result = await deleteExpenseForActor(session.userId, member.tripId, expenseId, body);
    return result;
  }
);

export const lookupExpenseCreation = legacyAuth(
  async (
    session,
    id: string,
    input: CreateExpenseInput
  ): Promise<ActionResult<ExpenseDto | null>> => {
    try {
      const member = await getTripMembership(session.userId, id);
      if (!member) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      const { readExpenseCreateResult } = await import('@/lib/expenseCreateRequest');
      const { default: mongoose } = await import('mongoose');
      return {
        success: true,
        data:
          (await readExpenseCreateResult(mongoose.connection.db!, {
            tripId: member.tripId,
            actorId: session.userId,
            input: parseLedgerInput(createExpenseSchema, input),
          })) ?? null,
      };
    } catch (error) {
      const failure = ledgerActionFailure(error);
      if (failure) return failure;
      if (error instanceof z.ZodError)
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      if (error instanceof TripWriteError)
        return { success: false, error: error.code, code: error.code };
      logger.error('lookupExpenseCreation error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
export async function lookupLedgerExpenseCreation(id: string, input: CreateExpenseInput) {
  return withLedgerV2(() => lookupExpenseCreation(id, input));
}

export async function updateLedgerExpense(
  id: string,
  expenseId: string,
  input: UpdateExpenseInput
) {
  return withLedgerV2(() => updateExpense(id, expenseId, input));
}

export const getExpenses = withLegacyTripRead(getLedgerExpenses);
