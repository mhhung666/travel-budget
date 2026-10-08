import { useState } from 'react';
import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  expenseOptionsSchema,
  expensePreviewSchema,
  type ExpensePreviewInput,
} from '@/api/contracts';
import type { SessionManager } from '@/api/session';
import { useAuth } from '@/features/auth/AuthProvider';
import { keepAccessDenial, recordAccessDenial } from '@/features/auth/accessGuard';
import { isAccessDenied } from '@/features/auth/errorMessage';
import { expensesKey, keepFirstPage } from './queries';

type Requester = Pick<SessionManager, 'requestAs'> & {
  api: Pick<SessionManager['api'], 'environment'>;
};
const tripPath = (tripId: string) => `/trips/${encodeURIComponent(tripId)}`;

/** Pending expense records of a trip, read from the device database (never from the network). */
export const pendingKey = (
  environment: string | undefined,
  userId: string | undefined,
  tripId: string
) => [environment, userId, 'pending-expenses', tripId] as const;

export const expenseOptionsQuery = (
  manager: Requester,
  userId: string | undefined,
  tripId: string
) =>
  queryOptions({
    queryKey: [manager.api.environment, userId, 'expense-options', tripId, 'v2'],
    enabled: !!userId,
    refetchOnMount: 'always',
    queryFn: ({ client, queryKey, signal }) =>
      keepAccessDenial(client, queryKey, () =>
        manager.requestAs(userId!, `${tripPath(tripId)}/expense-options`, expenseOptionsSchema, {
          signal,
        })
      ),
  });
/** Only a successful read after entry may reveal a draft; a recorded denial keeps it hidden. */
export function canShowExpenseDraft(
  client: QueryClient,
  queryKey: readonly unknown[],
  successesAtMount: number
) {
  const state = client.getQueryState(queryKey);
  return (state?.dataUpdateCount ?? 0) > successesAtMount && !isAccessDenied(state?.error);
}
export function useExpenseOptions(tripId: string) {
  const { manager, user } = useAuth();
  const client = useQueryClient();
  const query = expenseOptionsQuery(manager, user?.id, tripId);
  const result = useQuery(query);
  const [successesAtMount] = useState(
    () => client.getQueryState(query.queryKey)?.dataUpdateCount ?? 0
  );
  // A persisted draft is hidden until this mounted entry has rechecked authorization. Later
  // transport failures may keep an already authorized open form usable for local saving.
  return { ...result, authorized: canShowExpenseDraft(client, query.queryKey, successesAtMount) };
}
/**
 * For a request that found out access to the trip is gone (a refused preview): records that as the
 * member options' own error, so the members stay hidden through later failures and re-entering.
 */
export function useDenyExpenseOptions(tripId: string) {
  const { manager, user } = useAuth();
  const client = useQueryClient();
  const { queryKey } = expenseOptionsQuery(manager, user?.id, tripId);
  return (error: unknown) => recordAccessDenial(client, queryKey, error);
}

/** The backend's equal-split preview. Read-only: it saves nothing and holds nothing. */
export const requestPreview = (
  manager: Pick<SessionManager, 'requestAs'>,
  userId: string,
  tripId: string,
  input: ExpensePreviewInput,
  signal?: AbortSignal,
  beforeSend?: () => void
) =>
  manager.requestAs(userId, `${tripPath(tripId)}/expenses/preview`, expensePreviewSchema, {
    method: 'POST',
    body: input,
    signal,
    beforeSend,
  });

/**
 * Marks everything an added expense changes as stale and rereads what is on screen: the expense
 * list (newest page only), details, the settlement, the trip summary and the trip list. It rejects
 * when an on-screen read fails, so callers can say the data is out of date, not that saving failed.
 */
export async function refreshTripData(
  client: QueryClient,
  environment: string,
  userId: string,
  tripId: string,
  deletedExpenseId?: string
): Promise<void> {
  if (deletedExpenseId)
    client.removeQueries({
      queryKey: [environment, userId, 'expense', tripId, deletedExpenseId, 'v2'],
      exact: true,
    });
  keepFirstPage(client, expensesKey(environment, userId, tripId));
  const refetch = (...key: unknown[]) =>
    client.invalidateQueries({ queryKey: [environment, userId, ...key] }, { throwOnError: true });
  await Promise.all([
    refetch('expenses', tripId),
    client.invalidateQueries(
      {
        queryKey: [environment, userId, 'expense', tripId],
        predicate: (query) => query.queryKey[4] !== deletedExpenseId,
      },
      { throwOnError: true }
    ),
    refetch('settlement', tripId),
    refetch('trip', tripId),
    refetch('trips'),
  ]);
}
