'use server';

import { revalidatePath } from 'next/cache';
import { Expense, Trip, EXPENSE_CATEGORIES } from '@/models';
import { getSession } from '@/lib/auth';
import { getTripMembership } from '@/lib/permissions';
import {
  createExpenseSchema,
  updateExpenseSchema,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from '@/lib/validation';
import type { ActionResult } from './types';
import type { Expense as ExpenseDto } from '@/types';

type PopulatedRef = { _id: { toString(): string }; username: string; displayName: string } | null;

type LeanExpense = {
  _id: { toString(): string };
  amount: number;
  originalAmount: number;
  currency: string;
  exchangeRate: number;
  description: string;
  category: string | null;
  date: Date;
  createdAt: Date;
  payer: PopulatedRef;
  splits: { user: PopulatedRef; shareAmount: number }[];
};

function toDateStr(d: Date | string): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : d;
}

function toExpenseDto(e: LeanExpense, tripId: string): ExpenseDto {
  return {
    id: e._id.toString(),
    trip_id: tripId,
    amount: e.amount,
    original_amount: e.originalAmount,
    currency: e.currency,
    exchange_rate: e.exchangeRate,
    description: e.description,
    category: e.category || 'other',
    date: toDateStr(e.date),
    created_at: e.createdAt.toISOString(),
    payer_id: e.payer?._id.toString() || '',
    payer_name: e.payer?.displayName || 'Unknown',
    splits: (e.splits || []).map((s) => ({
      user_id: s.user?._id.toString() || '',
      share_amount: s.shareAmount,
      username: s.user?.username || 'Unknown',
      display_name: s.user?.displayName || 'Unknown',
    })),
  };
}

/**
 * Get all expenses for a trip
 */
export async function getExpenses(tripIdOrCode: string): Promise<ActionResult<ExpenseDto[]>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

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
    console.error('Get expenses error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Create a new expense
 */
export async function createExpense(
  tripIdOrCode: string,
  input: CreateExpenseInput
): Promise<ActionResult<ExpenseDto>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

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

    const { payer_id, original_amount, currency, exchange_rate, description, category, date, splits } =
      validation.data;

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
    return { success: true, data: toExpenseDto(created.toObject() as unknown as LeanExpense, tripId) };
  } catch (error) {
    console.error('Create expense error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Update an expense
 */
export async function updateExpense(
  tripIdOrCode: string,
  expenseId: string,
  input: UpdateExpenseInput
): Promise<ActionResult<{ message: string }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

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

    const { original_amount, currency, exchange_rate, description, category, payer_id, date, splits } =
      validation.data;

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
    console.error('Update expense error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Delete an expense
 */
export async function deleteExpense(
  tripIdOrCode: string,
  expenseId: string
): Promise<ActionResult<{ message: string }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    const membership = await getTripMembership(session.userId, tripIdOrCode);
    if (!membership) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    // splits 內嵌於 expense 文件，刪除 expense 即一併移除
    await Expense.deleteOne({ _id: expenseId, trip: membership.tripId });

    revalidatePath(`/trips/${tripIdOrCode}`);
    return { success: true, data: { message: '支出已刪除' } };
  } catch (error) {
    console.error('Delete expense error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}
