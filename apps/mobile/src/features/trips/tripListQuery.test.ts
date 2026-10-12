import { QueryClient } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import {
  tripListQuerySchema,
  tripsV2Schema,
  tripSelectionV2Schema,
} from '@travel-budget/contracts';
import { z } from 'zod';
import { ApiError, type RequestOptions } from '@/api/client';
import { errorMessage } from '@/features/auth/errorMessage';
import { messages } from '@/i18n/messages';
import { tripListQuery } from './queries';
vi.mock('react-native', () => ({ AppState: {} }));
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: vi.fn() }));

const date = '2026-10-12';
const actor = 'a'.repeat(24);
const response = (archive = 'unarchived', sort = 'list') => ({
  items: [],
  nextPage: null,
  metadata: {
    archive,
    sort,
    date,
    counts: { unarchived: 43, archived: 42 },
    quickAdd: { candidateCount: 43, ongoingCount: 0, directTripId: null },
  },
});
const fixture = () => {
  const request = vi.fn(
    async (
      _actor: string,
      _path: string,
      _schema: z.ZodType,
      _options: RequestOptions
    ): Promise<unknown> => response()
  );
  return {
    api: { environment: 'https://test/api/v1' },
    request,
    requestAs: async <T>(
      account: string,
      path: string,
      schema: z.ZodType<T>,
      options: RequestOptions = {}
    ): Promise<T> => schema.parse(await request(account, path, schema, options)),
  };
};
it('keeps environment/account/day/filter/order distinct and retains write invalidation prefix', async () => {
  const manager = fixture();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const queries = [
    tripListQuery(manager, actor, date, { archive: 'unarchived', sort: 'list' }),
    tripListQuery(manager, actor, date, { archive: 'archived', sort: 'list' }),
    tripListQuery(manager, actor, date, { archive: 'unarchived', sort: 'quick-add' }),
    tripListQuery(manager, 'b'.repeat(24), date, { archive: 'unarchived', sort: 'list' }),
    tripListQuery({ ...manager, api: { environment: 'other' } }, actor, date, {
      archive: 'unarchived',
      sort: 'list',
    }),
    tripListQuery(manager, actor, '2026-10-13', { archive: 'unarchived', sort: 'list' }),
  ];
  expect(new Set(queries.map((q) => JSON.stringify(q.queryKey))).size).toBe(6);
  await client.fetchInfiniteQuery(queries[0]);
  const [requestedActor, path, schema, options] = manager.request.mock.calls[0] as unknown as [
    string,
    string,
    unknown,
    { signal: AbortSignal },
  ];
  expect(requestedActor).toBe(actor);
  expect(path).toBe('/trips?page=1&date=2026-10-12&archive=unarchived&sort=list');
  expect(schema).toBe(tripsV2Schema);
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(manager.request).toHaveBeenCalledOnce();
  await client.invalidateQueries({
    queryKey: [manager.api.environment, actor, 'trips'],
    refetchType: 'none',
  });
  expect(client.getQueryState(queries[0].queryKey)?.isInvalidated).toBe(true);
  client.clear();
});
it.each(['missing', 'archive', 'sort', 'date'] as const)(
  'fails closed for %s metadata without falling back or requesting more pages',
  async (kind) => {
    const manager = fixture();
    const body = response();
    if (kind === 'missing') Reflect.deleteProperty(body, 'metadata');
    else body.metadata[kind] = { archive: 'archived', sort: 'legacy', date: '2026-10-13' }[kind];
    manager.request.mockResolvedValue(body);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await expect(
      client.fetchInfiniteQuery(
        tripListQuery(manager, actor, date, { archive: 'unarchived', sort: 'list' })
      )
    ).rejects.toMatchObject({ code: 'TRIP_LIST_SERVICE_UNAVAILABLE' });
    expect(manager.request).toHaveBeenCalledOnce();
    client.clear();
  }
);
it('missing metadata remains compatible with old readers, but cannot satisfy the new contract', () => {
  expect(tripsV2Schema.safeParse({ items: [], nextPage: null }).success).toBe(true);
  expect(tripSelectionV2Schema.safeParse({ items: [], nextPage: null }).success).toBe(false);
  expect(tripListQuerySchema.parse({})).toEqual({ page: '1', archive: 'all', sort: 'legacy' });
  expect(tripListQuerySchema.safeParse({ sort: 'quick-add', archive: 'archived' }).success).toBe(
    false
  );
});
it('does not start an unauthenticated manual fetch or mask a session/account cancellation', async () => {
  const manager = fixture();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const disabled = tripListQuery(manager, undefined, date, { archive: 'unarchived', sort: 'list' });
  expect(disabled.enabled).toBe(false);
  await expect(client.fetchInfiniteQuery(disabled)).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(manager.request).not.toHaveBeenCalled();
  manager.request.mockRejectedValueOnce(new ApiError('CANCELLED'));
  await expect(
    client.fetchInfiniteQuery(
      tripListQuery(manager, actor, date, { archive: 'unarchived', sort: 'list' })
    )
  ).rejects.toMatchObject({ code: 'CANCELLED' });
  client.clear();
});
it('preserves empty-page full metadata rather than deriving counts from items', async () => {
  const manager = fixture();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = await client.fetchInfiniteQuery(
    tripListQuery(manager, actor, date, { archive: 'unarchived', sort: 'list' })
  );
  expect(result.pages[0].items).toEqual([]);
  expect(result.pages[0].metadata.counts).toEqual({ unarchived: 43, archived: 42 });
  expect(manager.request).toHaveBeenCalledOnce();
  client.clear();
});
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'has an explicit service-not-ready message in %s',
  (locale) => {
    expect(errorMessage(new ApiError('TRIP_LIST_SERVICE_UNAVAILABLE'), messages[locale])).toBe(
      messages[locale].tripListUnavailable
    );
    expect(messages[locale].tripListUnavailable).not.toBe(messages[locale].genericError);
  }
);
