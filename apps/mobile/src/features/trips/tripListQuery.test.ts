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
it('quick-add fetches only the requested page despite full candidate metadata, not every financial page', async () => {
  const manager = fixture();
  const ledger = { baseCurrency: 'TWD', moneyScale: 2 };
  manager.request.mockImplementation(async (_actor, path) => {
    const page = Number(new URL(`https://test${path}`).searchParams.get('page'));
    return {
      ...response('unarchived', 'quick-add'),
      items: Array.from({ length: page === 3 ? 3 : 20 }, (_, n) => ({
        id: (n + (page - 1) * 20 + 1).toString(16).padStart(24, '0'),
        name: `Candidate ${n}`,
        description: null,
        startDate: null,
        endDate: null,
        destination: null,
        archived: false,
        memberCount: 1,
        mySpent: 0,
        myBalance: 0,
        phase: 'unscheduled',
        ledger,
      })),
      nextPage: page < 3 ? page + 1 : null,
    };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { InfiniteQueryObserver } = await import('@tanstack/react-query');
  const observer = new InfiniteQueryObserver(
    client,
    tripListQuery(manager, actor, date, { archive: 'unarchived', sort: 'quick-add' })
  );
  const stop = observer.subscribe(() => undefined);
  try {
    await observer.refetch();
    expect(manager.request).toHaveBeenCalledOnce();
    expect(observer.getCurrentResult().data?.pages[0].metadata.quickAdd.candidateCount).toBe(43);
    expect(observer.getCurrentResult().data?.pages).toHaveLength(1);
    await observer.fetchNextPage();
    expect(manager.request).toHaveBeenCalledTimes(2);
    expect(observer.getCurrentResult().data?.pages).toHaveLength(2);
    expect(manager.request.mock.calls[1][1]).toBe(
      '/trips?page=2&date=2026-10-12&archive=unarchived&sort=quick-add'
    );
  } finally {
    stop();
    client.clear();
  }
});

it('sends a scoped full-list preference and verifies its echo, with separate cache keys', async () => {
  const manager = fixture();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const id = 'c'.repeat(24);
  const plain = tripListQuery(manager, actor, date, { archive: 'unarchived', sort: 'quick-add' });
  const preferred = tripListQuery(
    manager,
    actor,
    date,
    { archive: 'unarchived', sort: 'quick-add' },
    id
  );
  expect(preferred.queryKey).not.toEqual(plain.queryKey);
  manager.request.mockResolvedValue(response('unarchived', 'quick-add'));
  await expect(client.fetchInfiniteQuery(preferred)).rejects.toMatchObject({
    code: 'TRIP_LIST_SERVICE_UNAVAILABLE',
  });
  manager.request.mockResolvedValue({
    ...response('unarchived', 'quick-add'),
    metadata: {
      ...response('unarchived', 'quick-add').metadata,
      preferredTripId: id,
    },
  });
  const result = await client.fetchInfiniteQuery(preferred);
  expect(result.pages[0].metadata.preferredTripId).toBe(id);
  expect(manager.request.mock.calls[1][1]).toContain(`&preferred_trip_id=${id}`);
  expect(manager.request.mock.calls[1][0]).toBe(actor);
  client.clear();
});
