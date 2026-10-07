import { Copy } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { isAccessDenied } from '@/features/auth/errorMessage';
import { useTrip } from '@/features/trips/queries';

/** Every named context is withheld immediately after a catalog or HTTP denial. */
export function TripContext({ tripId }: { tripId: string }) {
  const query = useTrip(tripId);
  const { manager, user, status } = useAuth();
  const { catalog } = useDraftCatalog();
  const scope = user ? { environment: manager.api.baseUrl, accountId: user.id } : null;
  if (
    status !== 'signedIn' ||
    !scope ||
    !catalog.isVisible(scope, tripId) ||
    isAccessDenied(query.error)
  )
    return null;
  return query.data ? <Copy>{query.data.name}</Copy> : null;
}
