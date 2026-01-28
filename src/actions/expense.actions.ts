'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getTripId, requireMember } from '@/lib/permissions';
import {
  createExpenseSchema,
  updateExpenseSchema,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from '@/lib/validation';
import type { ActionResult } from './types';
import type { Expense } from '@/types';

/**
 * Get all expenses for a trip
 */
export async function getExpenses(tripIdOrCode: string): Promise<ActionResult<Expense[]>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(tripIdOrCode);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    // Check membership
    try {
      await requireMember(session.userId, tripId);
    } catch {
      return { success: false, error: '您不是此旅行的成員', code: 'FORBIDDEN' };
    }

    // Get all expenses with splits
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select(
        `
        id,
        amount,
        original_amount,
        currency,
        exchange_rate,
        description,
        category,
        date,
        created_at,
        payer:users!expenses_payer_id_fkey (
          id,
          username,
          display_name
        )
      `
      )
      .eq('trip_id', tripId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (expensesError) throw expensesError;

    // Get splits for each expense
    const expensesWithSplits = await Promise.all(
      (expenses || []).map(async (expense: any) => {
        const { data: splits } = await supabase
          .from('expense_splits')
          .select(
            `
            user_id,
            share_amount,
            users!expense_splits_user_id_fkey (
              username,
              display_name
            )
          `
          )
          .eq('expense_id', expense.id);

        const formattedSplits =
          splits?.map((split: any) => {
            const user = Array.isArray(split.users) ? split.users[0] : split.users;
            return {
              user_id: split.user_id,
              share_amount: split.share_amount,
              username: user?.username,
              display_name: user?.display_name,
            };
          }) || [];

        const payer = Array.isArray(expense.payer) ? expense.payer[0] : expense.payer;
        return {
          id: expense.id,
          trip_id: tripId,
          amount: expense.amount,
          original_amount: expense.original_amount,
          currency: expense.currency,
          exchange_rate: expense.exchange_rate,
          description: expense.description,
          category: expense.category || 'other',
          date: expense.date,
          created_at: expense.created_at,
          payer_id: payer?.id,
          payer_name: payer?.display_name,
          splits: formattedSplits,
        };
      })
    );

    return { success: true, data: expensesWithSplits };
  } catch (error) {
    console.error('Get expenses error:', error);
    return { success: false, error: '獲取支出列表失敗', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Create a new expense
 */
export async function createExpense(
  tripIdOrCode: string,
  input: CreateExpenseInput
): Promise<ActionResult<Expense>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(tripIdOrCode);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    // Check membership
    try {
      await requireMember(session.userId, tripId);
    } catch {
      return { success: false, error: '您不是此旅行的成員', code: 'FORBIDDEN' };
    }

    const validation = createExpenseSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      };
    }

    const { payer_id, original_amount, currency, exchange_rate, description, category, date, split_with } =
      validation.data;

    // Calculate TWD amount
    const amount = original_amount * exchange_rate;

    // Validate payer and split members are trip members
    const { data: members } = await supabase
      .from('trip_members')
      .select('user_id')
      .eq('trip_id', tripId);

    const memberIds = members?.map((m) => m.user_id) || [];

    if (!memberIds.includes(payer_id)) {
      return { success: false, error: '付款人不是旅行成員', code: 'VALIDATION_ERROR' };
    }

    for (const userId of split_with) {
      if (!memberIds.includes(userId)) {
        return { success: false, error: '分帳對象必須都是旅行成員', code: 'VALIDATION_ERROR' };
      }
    }

    // Calculate share amount
    const shareAmount = amount / split_with.length;

    // Create expense
    const { data: expenseData, error: expenseError } = await supabase
      .from('expenses')
      .insert({
        trip_id: tripId,
        payer_id,
        amount,
        original_amount,
        currency,
        exchange_rate,
        description,
        category,
        date,
      })
      .select()
      .single();

    if (expenseError || !expenseData) throw expenseError;

    // Create splits
    const splitsToInsert = split_with.map((userId: number) => ({
      expense_id: expenseData.id,
      user_id: userId,
      share_amount: shareAmount,
    }));

    const { error: splitsError } = await supabase.from('expense_splits').insert(splitsToInsert);

    if (splitsError) throw splitsError;

    // Get complete expense info
    const { data: expense } = await supabase
      .from('expenses')
      .select(
        `
        id,
        amount,
        original_amount,
        currency,
        exchange_rate,
        description,
        category,
        date,
        created_at,
        payer:users!expenses_payer_id_fkey (
          id,
          username,
          display_name
        )
      `
      )
      .eq('id', expenseData.id)
      .single();

    const payer = Array.isArray(expense?.payer) ? expense.payer[0] : expense?.payer;
    const formattedExpense: Expense = {
      id: expense?.id,
      trip_id: tripId,
      amount: expense?.amount,
      original_amount: expense?.original_amount,
      currency: expense?.currency,
      exchange_rate: expense?.exchange_rate,
      description: expense?.description,
      category: expense?.category || 'other',
      date: expense?.date,
      created_at: expense?.created_at,
      payer_id: payer?.id,
      payer_name: payer?.display_name,
      splits: [],
    };

    revalidatePath(`/trips/${tripIdOrCode}`);
    return { success: true, data: formattedExpense };
  } catch (error) {
    console.error('Create expense error:', error);
    return { success: false, error: '新增支出失敗', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Update an expense
 */
export async function updateExpense(
  tripIdOrCode: string,
  expenseId: number,
  input: UpdateExpenseInput
): Promise<ActionResult<{ message: string }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(tripIdOrCode);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    // Check membership
    try {
      await requireMember(session.userId, tripId);
    } catch {
      return { success: false, error: '您不是此旅行的成員', code: 'FORBIDDEN' };
    }

    // Check expense exists
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .select('id, original_amount, exchange_rate')
      .eq('id', expenseId)
      .eq('trip_id', tripId)
      .single();

    if (expenseError || !expense) {
      return { success: false, error: '支出不存在', code: 'NOT_FOUND' };
    }

    const validation = updateExpenseSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      };
    }

    const { original_amount, currency, exchange_rate, description, category } = validation.data;

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (description !== undefined) updateData.description = description.trim();
    if (original_amount !== undefined) updateData.original_amount = original_amount;
    if (currency !== undefined) updateData.currency = currency;
    if (exchange_rate !== undefined) updateData.exchange_rate = exchange_rate;
    if (category !== undefined) updateData.category = category;

    // Recalculate TWD amount if needed
    if (original_amount !== undefined || exchange_rate !== undefined) {
      const newOriginalAmount = original_amount ?? expense.original_amount;
      const newExchangeRate = exchange_rate ?? expense.exchange_rate;
      updateData.amount = newOriginalAmount * newExchangeRate;
    }

    // Update expense
    const { error: updateError } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', expenseId);

    if (updateError) throw updateError;

    // Update splits if amount changed
    if (updateData.amount !== undefined) {
      const { data: splits } = await supabase
        .from('expense_splits')
        .select('id')
        .eq('expense_id', expenseId);

      if (splits && splits.length > 0) {
        const shareAmount = (updateData.amount as number) / splits.length;

        const { error: updateSplitsError } = await supabase
          .from('expense_splits')
          .update({ share_amount: shareAmount })
          .eq('expense_id', expenseId);

        if (updateSplitsError) throw updateSplitsError;
      }
    }

    revalidatePath(`/trips/${tripIdOrCode}`);
    return { success: true, data: { message: '支出已更新' } };
  } catch (error) {
    console.error('Update expense error:', error);
    return { success: false, error: '更新支出失敗', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Delete an expense
 */
export async function deleteExpense(
  tripIdOrCode: string,
  expenseId: number
): Promise<ActionResult<{ message: string }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(tripIdOrCode);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    // Check membership
    try {
      await requireMember(session.userId, tripId);
    } catch {
      return { success: false, error: '您不是此旅行的成員', code: 'FORBIDDEN' };
    }

    // Check expense exists
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .select('id')
      .eq('id', expenseId)
      .eq('trip_id', tripId)
      .single();

    if (expenseError || !expense) {
      return { success: false, error: '支出不存在', code: 'NOT_FOUND' };
    }

    // Delete expense (splits will cascade)
    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', expenseId);

    if (deleteError) throw deleteError;

    revalidatePath(`/trips/${tripIdOrCode}`);
    return { success: true, data: { message: '支出已刪除' } };
  } catch (error) {
    console.error('Delete expense error:', error);
    return { success: false, error: '刪除支出失敗', code: 'INTERNAL_ERROR' };
  }
}
