import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapLanding } from '@/hooks/queries/landingBootstrap';
import { tripKeys } from '@/hooks/queries/keys';
import type { TripLanding } from '@/types/tripLanding';

const data = {
  trip: { id: 'trip', name: 'Tokyo' },
  shell: { id: 'trip', total_spent: 50 },
  itinerary: [],
  checklists: [],
  settlement: null,
} as unknown as TripLanding;
describe('cold landing bootstrap', () => {
  it('coalesces three concurrent queries and seeds phase data into existing keys', async () => {
    const client = new QueryClient();
    const load = vi.fn().mockResolvedValue(data);
    const fallback = vi.fn();
    const requests = [
      client.fetchQuery({
        queryKey: tripKeys.shell('trip'),
        queryFn: () => bootstrapLanding(client, 'trip', 'shell', load, fallback),
      }),
      client.fetchQuery({
        queryKey: tripKeys.detail('trip'),
        queryFn: () => bootstrapLanding(client, 'trip', 'trip', load, fallback),
      }),
      client.fetchQuery({
        queryKey: tripKeys.itinerary('trip'),
        queryFn: () => bootstrapLanding(client, 'trip', 'itinerary', load, fallback),
      }),
    ];
    expect(await Promise.all(requests)).toEqual([data.shell, data.trip, data.itinerary]);
    expect(load).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    expect(client.getQueryData(tripKeys.checklists('trip'))).toEqual([]);
    expect(client.getQueryData(tripKeys.expenses('trip'))).toBeUndefined();
    client.clear();
  });

  it('uses individual resource refetches after mutation invalidation', async () => {
    const client = new QueryClient();
    client.setQueryData(tripKeys.itinerary('trip'), data.itinerary);
    await client.invalidateQueries({ queryKey: tripKeys.itinerary('trip') });
    const load = vi.fn();
    const fallback = vi.fn().mockResolvedValue([{ id: 'updated-day' }]);
    expect(await bootstrapLanding(client, 'trip', 'itinerary', load, fallback)).toEqual([
      { id: 'updated-day' },
    ]);
    expect(load).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledOnce();
    client.clear();
  });

  it('does not repopulate cleared query caches after logout', async () => {
    const client = new QueryClient();
    let resolve!: (value: TripLanding) => void;
    const promise = new Promise<TripLanding>((r) => {
      resolve = r;
    });
    const query = client
      .fetchQuery({
        queryKey: tripKeys.shell('trip'),
        queryFn: () => bootstrapLanding(client, 'trip', 'shell', () => promise, vi.fn()),
      })
      .catch(() => null);
    client.clear();
    resolve(data);
    await query;
    await Promise.resolve();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('shares failures without populating empty data and permits retry', async () => {
    const client = new QueryClient();
    const load = vi.fn().mockRejectedValueOnce(new Error('DB unavailable')).mockResolvedValue(data);
    await expect(bootstrapLanding(client, 'trip', 'shell', load, vi.fn())).rejects.toThrow(
      'DB unavailable'
    );
    expect(client.getQueryData(tripKeys.shell('trip'))).toBeUndefined();
    await expect(bootstrapLanding(client, 'trip', 'shell', load, vi.fn())).resolves.toEqual(
      data.shell
    );
    client.clear();
  });
});
