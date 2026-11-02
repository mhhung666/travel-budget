import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { itineraryQuery } from './queries';
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('@/features/localDrafts/provider', () => ({ useDraftCatalog: vi.fn() }));
const tripId = 'a'.repeat(24);
const result = { tripId, startDate: null, endDate: null, days: [] };
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  clients.push(client);
  let generation = 0;
  let visible = true;
  const catalog = {
    isVisible: () => visible,
    captureAccess: () => {
      const current = generation;
      return () => {
        if (current !== generation) throw new ApiError('CANCELLED');
      };
    },
  };
  const requestAs = vi.fn().mockResolvedValue(result);
  const manager = { api: { environment: 'https://a.test/api/v1' }, requestAs: requestAs as never };
  return {
    client,
    manager,
    requestAs,
    catalog,
    revoke: () => {
      generation++;
      visible = false;
    },
    options: () => itineraryQuery(manager, 'u1', tripId, catalog),
  };
}
afterEach(() => clients.splice(0).forEach((client) => client.clear()));
it('isolates environment/account/trip and uses the session-account-bound v2 transport', async () => {
  const h = setup();
  const value = await h.client.fetchQuery(h.options());
  expect(value).toEqual(result);
  expect(h.requestAs.mock.calls[0].slice(0, 2)).toEqual(['u1', `/trips/${tripId}/itinerary`]);
  expect(h.requestAs.mock.calls[0][3]).toMatchObject({
    signal: expect.any(AbortSignal),
    beforeSend: expect.any(Function),
  });
  expect(itineraryQuery(h.manager, 'u2', tripId, h.catalog).queryKey).not.toEqual(
    h.options().queryKey
  );
  expect(
    itineraryQuery(
      { ...h.manager, api: { environment: 'https://b.test' } },
      'u1',
      tripId,
      h.catalog
    ).queryKey
  ).not.toEqual(h.options().queryKey);
});
it('keeps a prior denial through later network failures', async () => {
  const h = setup();
  await h.client.fetchQuery(h.options());
  h.requestAs.mockRejectedValueOnce(new ApiError('NOT_FOUND', 404));
  await expect(h.client.fetchQuery(h.options())).rejects.toMatchObject({ status: 404 });
  h.requestAs.mockRejectedValueOnce(new ApiError('NETWORK'));
  await expect(h.client.fetchQuery(h.options())).rejects.toMatchObject({ status: 404 });
});
it('rejects a late success after revocation and blocks new reads of hidden trips', async () => {
  const h = setup();
  let finish!: (value: unknown) => void;
  h.requestAs.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = h.client.fetchQuery(h.options());
  h.revoke();
  finish(result);
  await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(h.options().enabled).toBe(false);
  await expect(h.client.fetchQuery(h.options())).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(h.requestAs).toHaveBeenCalledTimes(1);
});
it('guards the asynchronous send boundary and rejects a response for another trip', async () => {
  const h = setup();
  await h.client.fetchQuery(h.options());
  const beforeSend = h.requestAs.mock.calls[0][3].beforeSend;
  h.revoke();
  expect(beforeSend).toThrow();
  const other = setup();
  other.requestAs.mockResolvedValue({ ...result, tripId: 'b'.repeat(24) });
  await expect(other.client.fetchQuery(other.options())).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('does not configure a hidden or anonymous query as enabled', () => {
  const h = setup();
  expect(itineraryQuery(h.manager, undefined, tripId, h.catalog).enabled).toBe(false);
  h.revoke();
  expect(h.options().enabled).toBe(false);
});
