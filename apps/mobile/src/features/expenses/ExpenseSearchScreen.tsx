import { useEffect } from 'react';
import { router } from 'expo-router';
import { useExpenseBrowse } from './browseProvider';

/** Compatibility entry: activate the same trip's tools, then return to its existing list. */
export function ExpenseSearchScreen({ tripId }: { tripId: string }) {
  const { session } = useExpenseBrowse(tripId);
  useEffect(() => {
    if (!session.getSnapshot().tools) session.tools();
    router.dismissTo({ pathname: '/trips/[id]/expenses', params: { id: tripId } });
  }, [session, tripId]);
  return null;
}
