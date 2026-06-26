'use server';

import { revalidatePath } from 'next/cache';
import { Expense, Trip, EXPENSE_CATEGORIES } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import {
  createExpenseSchema,
  updateExpenseSchema,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from '@/lib/validation';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { Expense as ExpenseDto } from '@/types';
import { logger } from '@/lib/logger';
import { toExpenseDto, type ExpenseDtoInput } from '@/lib/dto';

type LeanExpense = ExpenseDtoInput & { date: Date };

/**
 * Whether split shares (TWD) add up to the expense amount, within a generous
 * tolerance (1 TWD or 1%). The client form balances splits exactly; this guard
 * only rejects a grossly malformed payload (e.g. a buggy/tampered client).
 */
function splitsMatchAmount(splits: { share_amount: number }[], amount: number): boolean {
  const sum = splits.reduce((acc, sp) => acc + sp.share_amount, 0);
  return Math.abs(sum - amount) <= Math.max(1, amount * 0.01);
}

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

/**
 * Create a new expense
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

      const {
        payer_id,
        original_amount,
        currency,
        exchange_rate,
        description,
        category,
        date,
        splits,
      } = validation.data;

      const amount = original_amount * exchange_rate;

      // Validate payer and split members are trip members
      const trip = await Trip.findById(tripId).select('members').lean<{
        members: { user: { toString(): string } }[];
      }>();
      const memberIds = new Set((trip?.members || []).map((m) => m.user.toString()));

      if (!memberIds.has(payer_id)) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }
      for (const split of splits) {
        if (!memberIds.has(split.user_id)) {
          return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
        }
      }

      // Defence-in-depth: split shares (TWD) must add up to the expense amount.
      // The form already balances them; this only rejects a grossly malformed
      // client payload (tolerance is generous to never trip on float rounding).
      if (!splitsMatchAmount(splits, amount)) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const created = await Expense.create({
        trip: tripId,
        payer: payer_id,
        amount,
        originalAmount: original_amount,
        currency,
        exchangeRate: exchange_rate,
        description,
        category: category as (typeof EXPENSE_CATEGORIES)[number],
        date: new Date(date),
        splits: splits.map((s) => ({ user: s.user_id, shareAmount: s.share_amount })),
      });

      await created.populate([
        { path: 'payer', select: 'username displayName' },
        { path: 'splits.user', select: 'username displayName' },
      ]);

      revalidatePath(`/trips/${tripIdOrCode}`);
      return {
        success: true,
        data: toExpenseDto(created.toObject() as unknown as LeanExpense, tripId),
      };
    } catch (error) {
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
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const { tripId } = membership;

      const validation = updateExpenseSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const {
        original_amount,
        currency,
        exchange_rate,
        description,
        category,
        payer_id,
        date,
        splits,
      } = validation.data;

      // 讀取目前值（同時作為 existence check）
      const current = await Expense.findOne({ _id: expenseId, trip: tripId })
        .select('originalAmount exchangeRate splits')
        .lean<{
          originalAmount: number;
          exchangeRate: number;
          splits: { user: { toString(): string }; shareAmount: number }[];
        }>();

      if (!current) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const set: Record<string, unknown> = {};
      if (description !== undefined) set.description = description.trim();
      if (original_amount !== undefined) set.originalAmount = original_amount;
      if (currency !== undefined) set.currency = currency;
      if (exchange_rate !== undefined) set.exchangeRate = exchange_rate;
      if (category !== undefined) set.category = category;
      if (payer_id !== undefined) set.payer = payer_id;
      if (date !== undefined) set.date = new Date(date);

      // Recalculate TWD amount if needed
      let newAmount: number | undefined;
      if (original_amount !== undefined || exchange_rate !== undefined) {
        const oa = original_amount ?? current.originalAmount;
        const er = exchange_rate ?? current.exchangeRate;
        newAmount = oa * er;
        set.amount = newAmount;
      }

      if (splits !== undefined) {
        // Validate against the effective amount (recomputed if amount/rate changed,
        // otherwise the expense's current amount). See splitsMatchAmount.
        const effectiveAmount = newAmount ?? current.originalAmount * current.exchangeRate;
        if (!splitsMatchAmount(splits, effectiveAmount)) {
          return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
        }
        set.splits = splits.map((s) => ({ user: s.user_id, shareAmount: s.share_amount }));
      } else if (newAmount !== undefined && current.splits.length > 0) {
        // 金額改變但未提供 splits：依人數平均重算
        const share = newAmount / current.splits.length;
        set.splits = current.splits.map((s) => ({ user: s.user, shareAmount: share }));
      }

      await Expense.updateOne({ _id: expenseId, trip: tripId }, { $set: set });

      revalidatePath(`/trips/${tripIdOrCode}`);
      return { success: true, data: { message: '支出已更新' } };
    } catch (error) {
      logger.error('Update expense error', error);
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
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      // splits 內嵌於 expense 文件，刪除 expense 即一併移除
      await Expense.deleteOne({ _id: expenseId, trip: membership.tripId });

      revalidatePath(`/trips/${tripIdOrCode}`);
      return { success: true, data: { message: '支出已刪除' } };
    } catch (error) {
      logger.error('Delete expense error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
