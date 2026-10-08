import { queryOptions, useQuery } from '@tanstack/react-query';
import { settlementSchema } from '@/api/contracts';
import type { SessionManager } from '@/api/session';
import { useAuth } from '@/features/auth/AuthProvider';
import { keepAccessDenial } from '@/features/auth/accessGuard';

export const settlementQuery = (
  manager: Pick<SessionManager, 'request'> & { api: Pick<SessionManager['api'], 'baseUrl'> },
  userId: string | undefined,
  tripId: string
) =>
  queryOptions({
    queryKey: [manager.api.baseUrl, userId, 'settlement', tripId, 'v2'],
    enabled: !!userId,
    queryFn: ({ client, queryKey, signal }) =>
      keepAccessDenial(client, queryKey, () =>
        manager.request(`/trips/${encodeURIComponent(tripId)}/settlement`, settlementSchema, {
          signal,
        })
      ),
  });

export function useSettlement(tripId: string) {
  const { manager, user } = useAuth();
  return useQuery(settlementQuery(manager, user?.id, tripId));
}
