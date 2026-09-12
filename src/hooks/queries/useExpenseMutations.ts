'use client';

import { onlineManager, useMutation, useQueryClient } from '@tanstack/react-query';
import { updateExpense, deleteExpense } from '@/actions';
import type { UpdateExpenseInput } from '@/lib/validation';
import type { AuthUserWithCreatedAt } from '@/actions';
import type { Expense, Member, TripShell } from '@/types';
import { buildOptimisticExpense, newOptimisticId } from '@/lib/optimisticExpense';
import {
  expenseCreateMutationKey,
  executeExpenseCreate,
  expenseCreateRetryOptions,
  invalidateExpenseDerived,
  unwrap,
  type CreateExpenseVars,
  type ExpenseCreateContext,
  reconcileExpenseCreate,
} from '@/lib/offlineMutations';
import { tripKeys } from './keys';
import { trackProductEvent } from '@/lib/productEvents';

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
    mutationFn: (vars: CreateExpenseVars) => executeExpenseCreate(queryClient, vars),
    ...expenseCreateRetryOptions,
    onMutate: async (vars: CreateExpenseVars): Promise<ExpenseCreateContext> => {
      const wasOffline = !onlineManager.isOnline();
      if (wasOffline) {
        trackProductEvent('offline_expense', { state: 'queued' });
      }
      const key = tripKeys.expenses(vars.tripId);
      // Stop in-flight refetches from clobbering the optimistic insert.
      await queryClient.cancelQueries({ queryKey: key });
      const members = queryClient.getQueryData<Member[]>(tripKeys.members(vars.tripId)) ?? [];
      const shellKey = tripKeys.shell(vars.tripId);
      const previousShell = queryClient.getQueryData<TripShell>(shellKey);
      const currentUser = queryClient.getQueryData<AuthUserWithCreatedAt | null>(
        tripKeys.currentUser
      );
      const optimistic = buildOptimisticExpense(vars.input, {
        tripId: vars.tripId,
        members,
        id: newOptimisticId(),
        createdAt: new Date().toISOString(),
      });
      queryClient.setQueryData<Expense[]>(key, (old = []) => [optimistic, ...old]);
      let appliedShell: TripShell | undefined;
      if (previousShell && currentUser) {
        const personalShare =
          vars.input.splits.find((split) => split.user_id === currentUser.id)?.share_amount ?? 0;
        const today = new Date();
        const todayKey = [
          today.getFullYear(),
          String(today.getMonth() + 1).padStart(2, '0'),
          String(today.getDate()).padStart(2, '0'),
        ].join('-');
        appliedShell = queryClient.setQueryData<TripShell>(shellKey, {
          ...previousShell,
          expense_count: previousShell.expense_count + 1,
          total_spent: previousShell.total_spent + personalShare,
          today_spent:
            previousShell.today_spent +
            (vars.input.date === todayKey
              ? vars.input.original_amount * vars.input.exchange_rate
              : 0),
        });
      }
      return { optimisticId: optimistic.id, previousShell, appliedShell, wasOffline };
    },
    onError: (_err, vars, ctx) => {
      reconcileExpenseCreate(queryClient, vars, ctx);
      if (ctx?.wasOffline) {
        trackProductEvent('offline_expense', { state: 'failed' });
      }
    },
    onSuccess: (data, vars, ctx) => {
      reconcileExpenseCreate(queryClient, vars, ctx, data);
      trackProductEvent('activation_step', { step: 'expense_created' });
      if (ctx?.wasOffline) {
        trackProductEvent('offline_expense', { state: 'synced' });
      }
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

  // Allocate per submission, without mutating a caller's reusable form data.
  const withRequestId = (vars: CreateExpenseVars): CreateExpenseVars => ({
    ...vars,
    input: {
      ...vars.input,
      client_request_id: vars.input.client_request_id ?? crypto.randomUUID(),
    },
  });
  return {
    create: {
      ...create,
      mutate: ((vars, options) =>
        create.mutate(withRequestId(vars), options)) as typeof create.mutate,
      mutateAsync: ((vars, options) =>
        create.mutateAsync(withRequestId(vars), options)) as typeof create.mutateAsync,
    },
    update,
    remove,
  };
}
