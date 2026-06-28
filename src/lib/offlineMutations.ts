import type { QueryClient } from '@tanstack/react-query';
import { createExpense } from '@/actions';
import type { ActionResult } from '@/actions';
import type { CreateExpenseInput } from '@/lib/validation';
import { tripKeys } from '@/hooks/queries/keys';

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

/** Invalidate every trip query derived from expenses (balances + stats + feed). */
export function invalidateExpenseDerived(queryClient: QueryClient, tripId: string): void {
  queryClient.invalidateQueries({ queryKey: tripKeys.expenses(tripId) });
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
    mutationFn: (vars: CreateExpenseVars) => unwrap(createExpense(vars.tripId, vars.input)),
    onSettled: (_data, _error, vars) => {
      if (vars) invalidateExpenseDerived(queryClient, vars.tripId);
    },
  });
}
