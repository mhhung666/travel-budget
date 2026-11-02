import { queryOptions, useQuery } from '@tanstack/react-query';
import { itinerarySchema } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import type { SessionManager } from '@/api/session';
import type { DraftCatalog } from '@/features/localDrafts/catalog';
import { useAuth } from '@/features/auth/AuthProvider';
import { keepAccessDenial } from '@/features/auth/accessGuard';
import { useDraftCatalog } from '@/features/localDrafts/provider';

type Requester = Pick<SessionManager, 'requestAs'> & {
  api: Pick<SessionManager['api'], 'environment'>;
};
export function itineraryQuery(
  manager: Requester,
  accountId: string | undefined,
  tripId: string,
  catalog: Pick<DraftCatalog, 'captureAccess' | 'isVisible'>
) {
  const scope = accountId ? { environment: manager.api.environment, accountId } : null;
  return queryOptions({
    queryKey: [manager.api.environment, accountId, 'itinerary', tripId, 'v2'],
    enabled: !!scope && catalog.isVisible(scope, tripId),
    queryFn: ({ client, queryKey, signal }) =>
      keepAccessDenial(client, queryKey, async () => {
        if (!scope || !catalog.isVisible(scope, tripId)) throw new ApiError('CANCELLED');
        const checkAccess = catalog.captureAccess(scope);
        const result = await manager.requestAs(
          accountId!,
          `/trips/${encodeURIComponent(tripId)}/itinerary`,
          itinerarySchema,
          {
            signal,
            beforeSend: () => {
              checkAccess(tripId);
              if (!catalog.isVisible(scope, tripId)) throw new ApiError('CANCELLED');
            },
          }
        );
        checkAccess(tripId);
        if (result.tripId !== tripId) throw new ApiError('INVALID_RESPONSE');
        return result;
      }),
  });
}
export function useItinerary(tripId: string) {
  const { manager, user, status } = useAuth();
  const { catalog } = useDraftCatalog();
  const options = itineraryQuery(manager, user?.id, tripId, catalog);
  const query = useQuery({ ...options, enabled: status === 'signedIn' && options.enabled });
  return {
    ...query,
    refresh: () => (status === 'signedIn' && options.enabled ? query.refetch() : undefined),
  };
}
