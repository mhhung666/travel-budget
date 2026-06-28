'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createExpense, updateExpense, deleteExpense } from '@/actions';
import type { UpdateExpenseInput } from '@/lib/validation';
import type { Expense, Member } from '@/types';
import { buildOptimisticExpense, newOptimisticId } from '@/lib/optimisticExpense';
import {
  expenseCreateMutationKey,
  invalidateExpenseDerived,
  unwrap,
  type CreateExpenseVars,
} from '@/lib/offlineMutations';
import { tripKeys } from './keys';

/**
 * Expense create/update/delete mutations for a trip.
 *
 * `create` is **offline-capable** (ROADMAP #5 Phase 2): it optimistically inserts
 * a placeholder expense (see {@link buildOptimisticExpense}) so the row appears
 * instantly, and when offline the mutation pauses and is replayed on reconnect
 * (the matching global defaults in {@link registerOfflineMutationDefaults} let it
 * survive a reload). `update`/`delete` stay online-only and are guarded in the UI.
 *
 * On settle each invalidates the expenses query plus the derived settlement /
 * stats / activity queries so those views refetch in the background.
 */
export function useExpenseMutations(tripId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => invalidateExpenseDerived(queryClient, tripId);

  const create = useMutation({
    mutationKey: expenseCreateMutationKey,
    mutationFn: (vars: CreateExpenseVars) => unwrap(createExpense(vars.tripId, vars.input)),
    onMutate: async (vars: CreateExpenseVars) => {
      const key = tripKeys.expenses(vars.tripId);
      // Stop in-flight refetches from clobbering the optimistic insert.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Expense[]>(key);
      const members = queryClient.getQueryData<Member[]>(tripKeys.members(vars.tripId)) ?? [];
      const optimistic = buildOptimisticExpense(vars.input, {
        tripId: vars.tripId,
        members,
        id: newOptimisticId(),
        createdAt: new Date().toISOString(),
      });
      queryClient.setQueryData<Expense[]>(key, (old = []) => [optimistic, ...old]);
      return { previous, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: (_data, _err, vars) => invalidateExpenseDerived(queryClient, vars.tripId),
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
