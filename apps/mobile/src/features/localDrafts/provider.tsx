import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { openDraftTripStore } from '@/storage/pendingExpenseDatabase';
import { DraftCatalog } from './catalog';

const Context = createContext<DraftCatalog | null>(null);
export function DraftCatalogProvider({ children }: PropsWithChildren) {
  const client = useQueryClient();
  const [catalog] = useState(() => new DraftCatalog(openDraftTripStore));
  useEffect(() => catalog.observe(client), [catalog, client]);
  return <Context.Provider value={catalog}>{children}</Context.Provider>;
}
export function useDraftCatalog() {
  const catalog = useContext(Context);
  if (!catalog) throw new Error('DraftCatalogProvider is missing');
  const state = useSyncExternalStore(catalog.subscribe, catalog.getSnapshot, catalog.getSnapshot);
  return { catalog, ...state };
}
export function useLocalTrips(tripId?: string) {
  const { manager, user } = useAuth();
  const { catalog, revision, storageFailed } = useDraftCatalog();
  const scope = user ? { environment: manager.api.environment, accountId: user.id } : null;
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [scope?.environment, scope?.accountId, 'local-draft-trips', tripId],
    enabled: !!scope,
    networkMode: 'always',
    gcTime: 0,
    queryFn: () =>
      tripId
        ? catalog.get(scope!, tripId).then((trip) => (trip ? [trip] : []))
        : catalog.list(scope!),
  });
  useEffect(() => {
    void client.invalidateQueries({
      queryKey: [manager.api.environment, user?.id, 'local-draft-trips'],
    });
  }, [client, manager.api.environment, user?.id, revision]);
  // Immediate denial filtering closes the gap before the persisted reread finishes.
  const data = scope
    ? query.data?.filter((trip) => catalog.isVisible(scope, trip.tripId))
    : undefined;
  return { ...query, data, scope, storageFailed };
}
