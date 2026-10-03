import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type { z } from 'zod';
import { expenseDetailSchema, expensesSchema } from '@/api/contracts';
import type { SessionManager } from '@/api/session';
import { useAuth } from '@/features/auth/AuthProvider';
import { keepAccessDenial } from '@/features/auth/accessGuard';
import { isAccessDenied } from '@/features/auth/errorMessage';

type ExpensePage = z.infer<typeof expensesSchema>;
type Requester = Pick<SessionManager, 'request'> & { api: Pick<SessionManager['api'], 'baseUrl'> };
const tripPath = (tripId: string) => `/trips/${encodeURIComponent(tripId)}`;

// Keys carry the API environment and account, so one account never reads another's cache entry.
export const expensesKey = (baseUrl: string, userId: string | undefined, tripId: string) =>
  [baseUrl, userId, 'expenses', tripId] as const;

export const expensesQuery = (manager: Requester, userId: string | undefined, tripId: string) =>
  infiniteQueryOptions({
    queryKey: expensesKey(manager.api.baseUrl, userId, tripId),
    enabled: !!userId,
    initialPageParam: null as string | null,
    queryFn: ({ client, queryKey, pageParam, signal }) =>
      keepAccessDenial(client, queryKey, () =>
        manager.request(
          `${tripPath(tripId)}/expenses${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
          expensesSchema,
          { signal }
        )
      ),
    getNextPageParam: (page: ExpensePage) => page.nextCursor ?? undefined,
  });

export const expenseQuery = (
  manager: Requester,
  userId: string | undefined,
  tripId: string,
  expenseId: string
) =>
  queryOptions({
    queryKey: [manager.api.baseUrl, userId, 'expense', tripId, expenseId],
    enabled: !!userId,
    queryFn: ({ client, queryKey, signal }) =>
      keepAccessDenial(client, queryKey, () =>
        manager.request(
          `${tripPath(tripId)}/expenses/${encodeURIComponent(expenseId)}`,
          expenseDetailSchema,
          { signal }
        )
      ),
  });

/**
 * Pull-to-refresh rereads the newest page only; older pages load on demand again. Skipped while an
 * access denial is recorded: `setQueryData` would clear the query's error and lift the denial.
 */
export function keepFirstPage(client: QueryClient, queryKey: readonly unknown[]) {
  if (isAccessDenied(client.getQueryState(queryKey)?.error)) return;
  client.setQueryData<InfiniteData<ExpensePage, string | null>>(
    queryKey,
    (data) => data && { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
  );
}

export function useExpenses(tripId: string) {
  const { manager, user } = useAuth();
  const client = useQueryClient();
  const options = expensesQuery(manager, user?.id, tripId);
  const query = useInfiniteQuery(options);
  const refresh = () => {
    keepFirstPage(client, options.queryKey);
    return query.refetch();
  };
  return { query, refresh };
}
export function useExpense(tripId: string, expenseId: string) {
  const { manager, user } = useAuth();
  return useQuery(expenseQuery(manager, user?.id, tripId, expenseId));
}
