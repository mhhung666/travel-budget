import { get, update } from 'idb-keyval';
import type { QueryClient } from '@tanstack/react-query';
import { tripKeys } from '@/hooks/queries/keys';
import type { TripShell } from '@/types';
const scopes = new WeakMap<QueryClient, { key: string; scope: string }>();
export function bindWebWriteCoordination(client: QueryClient, scope: string) {
  scopes.set(client, {
    key: `travel-budget-write-coordination:${encodeURIComponent(scope)}`,
    scope,
  });
}
export async function claimWebTripWrite(client: QueryClient, tripId: string, requestId: string) {
  const binding = scopes.get(client);
  if (!binding) return;
  const { key, scope } = binding;
  const trip = client.getQueryData<TripShell>(tripKeys.shell(tripId))?.id ?? tripId;
  // A tab can disappear after saving a terminal but before releasing the reservation.
  // Only matching, durable terminal IDs can heal that interrupted local completion.
  const [outbox, confirmed] = await Promise.all([
    get<Record<string, { status: string; vars?: { input?: { client_request_id?: string } } }>>(
      `travel-budget-expense-outbox:${encodeURIComponent(scope)}`
    ),
    get<Record<string, { status: string; request?: { body?: { client_request_id?: string } } }>>(
      `travel-budget-confirmed-v2:${encodeURIComponent(scope)}`
    ),
  ]);
  const terminalIds = new Set([
    ...Object.entries(outbox ?? {})
      .filter(
        ([id, e]) =>
          e.vars?.input?.client_request_id === id && ['done', 'failed'].includes(e.status)
      )
      .map(([id]) => id),
    ...Object.entries(confirmed ?? {})
      .filter(
        ([id, e]) =>
          e.request?.body?.client_request_id === id && ['done', 'rejected'].includes(e.status)
      )
      .map(([id]) => id),
  ]);
  await update<Record<string, string>>(key, (old = {}) => {
    old = Object.fromEntries(Object.entries(old).filter(([, id]) => !terminalIds.has(id)));
    if (old[trip] && old[trip] !== requestId) throw new Error('ledger.pendingWrite');
    return { ...old, [trip]: requestId };
  });
}
/** Never expire an ambiguous operation. Only a durable terminal releases its reservation. */
export async function releaseWebTripWrite(client: QueryClient, requestId: string) {
  const binding = scopes.get(client);
  if (!binding) return;
  await update<Record<string, string>>(binding.key, (old = {}) =>
    Object.fromEntries(Object.entries(old).filter(([, id]) => id !== requestId))
  );
}
