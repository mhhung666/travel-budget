import { replaceEqualDeep, type QueryClient } from '@tanstack/react-query';
import { saveExpenseOutbox } from './expenseOutbox';
import { createExpense } from '@/actions';
import type { ActionResult } from '@/actions';
import type { CreateExpenseInput } from '@/lib/validation';
import { tripKeys } from '@/hooks/queries/keys';
import { trackProductEvent } from '@/lib/productEvents';
import type { Expense, TripShell } from '@/types';

export interface ExpenseCreateContext {
  optimisticId: string;
  previousShell?: TripShell;
  appliedShell?: TripShell;
  wasOffline: boolean;
}

/** Remove only this mutation's placeholder; never restore a stale whole-list snapshot. */
export function reconcileExpenseCreate(
  queryClient: QueryClient,
  vars: CreateExpenseVars,
  context: ExpenseCreateContext | undefined,
  expense?: Expense
) {
  if (
    !queryClient
      .getMutationCache()
      .getAll()
      .some((m) => m.state.variables === vars)
  )
    return;
  const key = tripKeys.expenses(vars.tripId);
  if (expense || context?.optimisticId) {
    queryClient.setQueryData<Expense[]>(key, (current = []) => {
      const remaining = current.filter(
        (item) => item.id !== context?.optimisticId && item.id !== expense?.id
      );
      return expense ? [expense, ...remaining] : remaining;
    });
  }
  if (
    !expense &&
    context?.previousShell &&
    context.appliedShell &&
    replaceEqualDeep(
      context.appliedShell,
      queryClient.getQueryData(tripKeys.shell(vars.tripId))
    ) === context.appliedShell
  ) {
    // Compare values because persistence restores the context and cache as separate objects.
    // Only restore an unchanged projection; preserve concurrent/refetched changes.
    queryClient.setQueryData(tripKeys.shell(vars.tripId), context.previousShell);
  }
}

/**
 * Offline-queued mutation plumbing (ROADMAP #5 Phase 2).
 *
 * Expense creation is the one write supported offline: when the device is
 * offline the mutation is paused (default `networkMode: 'online'`), persisted to
 * IndexedDB alongside the query cache, and replayed on reconnect — including
 * after a full reload, which is why the mutation function must be re-registered
 * here via {@link registerOfflineMutationDefaults} (only the mutation key +
 * variables are serialized, never the function).
 *
 * Edit/delete remain online-only (guarded in the UI), so they don't need this.
 */

/** Mutation key shared by the live `useExpenseMutations` create + the defaults. */
export const expenseCreateMutationKey = ['expenses', 'create'] as const;

/** Variables for a create mutation — `tripId` is carried so a resumed (post
 * reload) mutation can target the right trip without a live component. */
export interface CreateExpenseVars {
  tripId: string;
  input: CreateExpenseInput;
}

export async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const result = await p;
  if (!result.success) throw new Error(result.error);
  return result.data;
}

class RetryableExpenseError extends Error {}

/** A rejected transport cannot tell us whether the server committed. Reuse the same key. */
export async function executeExpenseCreate(
  queryClient: QueryClient,
  vars: CreateExpenseVars
): Promise<Expense> {
  // Clearing the cache on logout does not cancel TanStack's existing retry timer.
  // Never send a removed request under a later authenticated session.
  if (
    !queryClient
      .getMutationCache()
      .getAll()
      .some((mutation) => mutation.state.variables === vars)
  ) {
    throw new Error('Expense request was cleared');
  }
  // Older paused queues have no key; attach one before their first replay.
  vars.input = {
    ...vars.input,
    client_request_id: vars.input.client_request_id ?? crypto.randomUUID(),
  };
  const context = queryClient
    .getMutationCache()
    .getAll()
    .find((m) => m.state.variables === vars)?.state.context as ExpenseCreateContext | undefined;
  // A restored legacy request must also reach durable storage before any network send.
  try {
    await saveExpenseOutbox(queryClient, vars, context, 'pending');
  } catch {
    throw new RetryableExpenseError('Unable to save expense locally');
  }
  if (
    !queryClient
      .getMutationCache()
      .getAll()
      .some((m) => m.state.variables === vars)
  )
    throw new Error('Expense request was cleared');
  let result: ActionResult<Expense>;
  try {
    result = await createExpense(vars.tripId, vars.input);
  } catch (error) {
    throw new RetryableExpenseError(error instanceof Error ? error.message : String(error));
  }
  if (!result.success) {
    if (result.code === 'INTERNAL_ERROR') throw new RetryableExpenseError(result.error);
    try {
      await saveExpenseOutbox(queryClient, vars, context, 'failed', result.error);
    } catch {
      throw new RetryableExpenseError('Unable to save expense failure');
    }
    throw new Error(result.error);
  }
  try {
    await saveExpenseOutbox(queryClient, vars, context, 'done', undefined, result.data);
  } catch {
    throw new RetryableExpenseError('Unable to save expense confirmation');
  }
  return result.data;
}

export const expenseCreateRetryOptions = {
  retry: (_failureCount: number, error: Error) => error instanceof RetryableExpenseError,
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000),
};

/** Invalidate every trip query derived from expenses (balances + stats + feed). */
export function invalidateExpenseDerived(queryClient: QueryClient, tripId: string): void {
  queryClient.invalidateQueries({ queryKey: tripKeys.expenses(tripId) });
  queryClient.invalidateQueries({ queryKey: tripKeys.expenseTags(tripId) });
  queryClient.invalidateQueries({ queryKey: tripKeys.shell(tripId) });
  queryClient.invalidateQueries({ queryKey: tripKeys.settlement(tripId) });
  queryClient.invalidateQueries({ queryKey: tripKeys.stats(tripId) });
  queryClient.invalidateQueries({ queryKey: tripKeys.activity(tripId) });
}

/**
 * Register the global create-expense mutation defaults on the QueryClient. Call
 * once at app start (see QueryProvider). Supplies the `mutationFn` so paused
 * mutations rehydrated from storage can resume after a reload, and an `onSettled`
 * that reconciles the cache once the replay lands.
 */
export function registerOfflineMutationDefaults(queryClient: QueryClient): void {
  queryClient.setMutationDefaults(expenseCreateMutationKey, {
    mutationFn: (vars: CreateExpenseVars) => executeExpenseCreate(queryClient, vars),
    ...expenseCreateRetryOptions,
    onSuccess: (data, vars, context: ExpenseCreateContext | undefined) => {
      reconcileExpenseCreate(queryClient, vars, context, data);
      trackProductEvent('activation_step', { step: 'expense_created' });
      trackProductEvent('offline_expense', { state: 'synced' });
    },
    onError: (_error, vars, context: ExpenseCreateContext | undefined) => {
      reconcileExpenseCreate(queryClient, vars, context);
      trackProductEvent('offline_expense', { state: 'failed' });
    },
    onSettled: (_data, _error, vars) => {
      if (vars) invalidateExpenseDerived(queryClient, vars.tripId);
    },
  });
}
