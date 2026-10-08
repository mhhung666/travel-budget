import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { isAccessDenied } from '@/features/auth/errorMessage';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { expenseOptionsQuery } from './entryQueries';

/** One observer at screen level. TripChrome/form owns refresh; labels never refetch on mount. */
export function tripMemberQuery(...args: Parameters<typeof expenseOptionsQuery>) {
  return { ...expenseOptionsQuery(...args), refetchOnMount: false as const };
}
export function useTripMembers(tripId: string, enabled = true) {
  const { manager, user, status } = useAuth();
  const { catalog } = useDraftCatalog();
  const scope = user ? { environment: manager.api.baseUrl, accountId: user.id } : null;
  const allowed = status === 'signedIn' && !!scope && catalog.isVisible(scope, tripId);
  const query = useQuery({
    ...tripMemberQuery(manager, user?.id, tripId),
    enabled: enabled && allowed,
  });
  const denied = enabled && (!allowed || isAccessDenied(query.error));
  const canRead = status === 'signedIn' && !!scope;
  return {
    roster: allowed && !isAccessDenied(query.error) ? query.data?.members : undefined,
    denied,
    canRead,
    isFetching: query.isFetching,
    // Routine list refresh must respect the catalog visibility gate.
    refresh: () => (enabled && allowed ? query.refetch() : undefined),
    // Explicit retry may recheck hidden trips through normal authorization/persistence.
    refetch: () => (enabled && canRead ? query.refetch() : undefined),
  };
}
