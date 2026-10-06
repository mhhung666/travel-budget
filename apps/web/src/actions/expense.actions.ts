'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { createExpenseForActor } from '@/lib/expenseCreate';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { RetiredBlobError } from '@/lib/blobReferences';
import { Expense } from '@/models';
import { updateExpenseForActor, deleteExpenseForActor } from '@/lib/expenseMaintenance';
import { getTripMembership } from '@/lib/permissions';
import {
  createExpenseSchema,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from '@/lib/validation';
import { withAuth } from './withAuth';
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
export const getExpenses = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<ExpenseDto[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const { tripId } = membership;

      // splits 已內嵌，payer 與 splits.user 一次 populate，徹底消除原本的 N+1
      const expenses = await Expense.find({ trip: tripId })
        .sort({ date: -1, createdAt: -1 })
        .populate('payer', 'username displayName')
        .populate('splits.user', 'username displayName')
        .lean<LeanExpense[]>();

      const data = expenses.map((e) => toExpenseDto(e, tripId));
      return { success: true, data };
    } catch (error) {
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
export const createExpense = withAuth(
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

      const validation = createExpenseSchema.safeParse(input);
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
      if (error instanceof RetiredBlobError)
        return { success: false, error: error.code, code: error.code };
      if (error instanceof TripWriteError)
        return { success: false, error: error.code, code: error.code };
      logger.error('Create expense error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Update an expense
 */
export const updateExpense = withAuth(
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
      logger.error('updateExpense adapter error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Delete an expense
 */
export const deleteExpense = withAuth(
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
      logger.error('getReceiptUrl error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
