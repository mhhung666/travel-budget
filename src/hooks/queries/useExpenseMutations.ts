'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createExpense, updateExpense, deleteExpense } from '@/actions';
import type { ActionResult } from '@/actions';
import type { CreateExpenseInput, UpdateExpenseInput } from '@/lib/validation';
import { tripKeys } from './keys';

async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const result = await p;
  if (!result.success) throw new Error(result.error);
  return result.data;
}

/**
 * Expense create/update/delete mutations for a trip.
 *
 * On success each invalidates the expenses query plus the derived settlement
 * and stats queries (changing expenses changes balances/transfers and stats),
 * so those views refetch in the background instead of the page calling
 * loadTripData() to refetch everything.
 */
export function useExpenseMutations(tripId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: tripKeys.expenses(tripId) });
    queryClient.invalidateQueries({ queryKey: tripKeys.settlement(tripId) });
    queryClient.invalidateQueries({ queryKey: tripKeys.stats(tripId) });
    queryClient.invalidateQueries({ queryKey: tripKeys.activity(tripId) });
  };

  const create = useMutation({
    mutationFn: (input: CreateExpenseInput) => unwrap(createExpense(tripId, input)),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ expenseId, input }: { expenseId: string; input: UpdateExpenseInput }) =>
      unwrap(updateExpense(tripId, expenseId, input)),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (expenseId: string) => unwrap(deleteExpense(tripId, expenseId)),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
