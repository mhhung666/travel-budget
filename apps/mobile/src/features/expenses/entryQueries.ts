import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  expenseOptionsSchema,
  expensePreviewSchema,
  type ExpensePreviewInput,
} from '@/api/contracts';
import type { SessionManager } from '@/api/session';
import { useAuth } from '@/features/auth/AuthProvider';
import { keepAccessDenial, recordAccessDenial } from '@/features/auth/accessGuard';
import { expensesKey, keepFirstPage } from './queries';

type Requester = Pick<SessionManager, 'request'> & { api: Pick<SessionManager['api'], 'baseUrl'> };
const tripPath = (tripId: string) => `/trips/${encodeURIComponent(tripId)}`;

/** Pending expense records of a trip, read from the device database (never from the network). */
export const pendingKey = (
  baseUrl: string | undefined,
  userId: string | undefined,
  tripId: string
) => [baseUrl, userId, 'pending-expenses', tripId] as const;

export const expenseOptionsQuery = (
  manager: Requester,
  userId: string | undefined,
  tripId: string
) =>
  queryOptions({
    queryKey: [manager.api.baseUrl, userId, 'expense-options', tripId],
    enabled: !!userId,
    queryFn: ({ client, queryKey, signal }) =>
      keepAccessDenial(client, queryKey, () =>
        manager.request(`${tripPath(tripId)}/expense-options`, expenseOptionsSchema, { signal })
      ),
  });
export function useExpenseOptions(tripId: string) {
  const { manager, user } = useAuth();
  return useQuery(expenseOptionsQuery(manager, user?.id, tripId));
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
  signal?: AbortSignal
) =>
  manager.requestAs(userId, `${tripPath(tripId)}/expenses/preview`, expensePreviewSchema, {
    method: 'POST',
    body: input,
    signal,
  });

/**
 * Marks everything an added expense changes as stale and rereads what is on screen: the expense
 * list (newest page only), details, the settlement, the trip summary and the trip list. It rejects
 * when an on-screen read fails, so callers can say the data is out of date, not that saving failed.
 */
export async function refreshTripData(
  client: QueryClient,
  baseUrl: string,
  userId: string,
  tripId: string
): Promise<void> {
  keepFirstPage(client, expensesKey(baseUrl, userId, tripId));
  const refetch = (...key: unknown[]) =>
    client.invalidateQueries({ queryKey: [baseUrl, userId, ...key] }, { throwOnError: true });
  await Promise.all([
    refetch('expenses', tripId),
    refetch('expense', tripId),
    refetch('settlement', tripId),
    refetch('trip', tripId),
    refetch('trips'),
  ]);
}
