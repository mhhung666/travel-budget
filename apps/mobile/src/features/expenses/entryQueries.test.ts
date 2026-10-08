import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { recordAccessDenial } from '@/features/auth/accessGuard';
import { isAccessDenied } from '@/features/auth/errorMessage';
import {
  expenseOptionsQuery,
  pendingKey,
  refreshTripData,
  requestPreview,
  canShowExpenseDraft,
} from './entryQueries';

// The hooks need React auth context; only the plain functions are under test.
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: vi.fn() }));

const BASE = 'https://a.test/api/v1';
const [TRIP, OTHER_TRIP, USER, OTHER_USER] = ['t1', 't2', 'u1', 'u2'];
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const page = (n: number) => ({ items: [], nextCursor: `c${n}` });

/** Keeps a query on screen, as a mounted screen would, and counts how often it was read. */
function observe(cache: QueryClient, queryKey: QueryKey, queryFn = async () => 'data') {
  const read = vi.fn(queryFn);
  const observer = new QueryObserver(cache, { queryKey, queryFn: read, staleTime: 60_000 });
  const stop = observer.subscribe(() => {});
  return { read, stop };
}
const invalidated = (cache: QueryClient, key: QueryKey) =>
  cache.getQueryState(key)?.isInvalidated ?? false;

describe('refreshTripData', () => {
  const keys = {
    list: [BASE, USER, 'expenses', TRIP, 'v2'],
    detail: [BASE, USER, 'expense', TRIP, 'e1', 'v2'],
    settlement: [BASE, USER, 'settlement', TRIP],
    landing: [BASE, USER, 'trip', TRIP, '2026-10-04'],
    trips: [BASE, USER, 'trips', '2026-10-04'],
  };
  const unrelated = {
    otherTrip: [BASE, USER, 'expenses', OTHER_TRIP],
    otherTripLanding: [BASE, USER, 'trip', OTHER_TRIP, '2026-10-04'],
    otherAccount: [BASE, OTHER_USER, 'expenses', TRIP, 'v2'],
    otherEnvironment: ['https://b.test/api/v1', USER, 'expenses', TRIP, 'v2'],
    options: [BASE, USER, 'expense-options', TRIP, 'v2'],
  };

  function seeded() {
    const cache = client();
    for (const key of [...Object.values(keys), ...Object.values(unrelated)])
      cache.setQueryData(key, 'old');
    // Expense lists hold infinite-query data.
    for (const key of [keys.list, unrelated.otherTrip, unrelated.otherAccount])
      cache.setQueryData(key, { pages: [page(0)], pageParams: [null] });
    return cache;
  }

  it('marks everything an added expense changes as stale, and nothing else', async () => {
    const cache = seeded();
    await refreshTripData(cache, BASE, USER, TRIP);
    for (const [name, key] of Object.entries(keys))
      expect(invalidated(cache, key), name).toBe(true);
    for (const [name, key] of Object.entries(unrelated))
      expect(invalidated(cache, key), name).toBe(false);
  });

  it('rereads what is on screen and leaves unrelated queries alone', async () => {
    const cache = seeded();
    const onScreen = [keys.list, keys.settlement, keys.landing, keys.trips].map((key) =>
      observe(cache, key)
    );
    const offTrip = observe(cache, unrelated.otherTrip);
    const options = observe(cache, unrelated.options);
    await refreshTripData(cache, BASE, USER, TRIP);
    for (const { read } of onScreen) expect(read).toHaveBeenCalledTimes(1);
    expect(offTrip.read).not.toHaveBeenCalled();
    expect(options.read).not.toHaveBeenCalled();
    [...onScreen, offTrip, options].forEach(({ stop }) => stop());
  });

  it('a deleted detail is evicted without treating its expected 404 as a failed refresh', async () => {
    const cache = seeded();
    const deleted = observe(cache, keys.detail, async () => {
      throw new ApiError('RESOURCE_GONE', 404);
    });
    const remaining = observe(cache, [BASE, USER, 'expense', TRIP, 'e2']);
    await refreshTripData(cache, BASE, USER, TRIP, 'e1');
    expect(deleted.read).not.toHaveBeenCalled();
    expect(cache.getQueryData(keys.detail)).toBeUndefined();
    expect(remaining.read).toHaveBeenCalledTimes(1);
    deleted.stop();
    remaining.stop();
  });

  it('rereads only the newest page of the expense list', async () => {
    const cache = client();
    cache.setQueryData(keys.list, {
      pages: [page(0), page(1), page(2)],
      pageParams: [null, 'c0', 'c1'],
    });
    await refreshTripData(cache, BASE, USER, TRIP);
    expect(cache.getQueryData<{ pages: unknown[] }>(keys.list)?.pages).toHaveLength(1);
  });

  it('keeps a recorded access denial instead of lifting it', async () => {
    const cache = client();
    cache.setQueryData(keys.list, { pages: [page(0), page(1)], pageParams: [null, 'c0'] });
    await cache
      .fetchInfiniteQuery({
        queryKey: keys.list,
        initialPageParam: null,
        queryFn: () => Promise.reject(new ApiError('NOT_FOUND', 404)),
      })
      .catch(() => {});
    expect(cache.getQueryState(keys.list)?.error).toBeInstanceOf(ApiError);
    await refreshTripData(cache, BASE, USER, TRIP);
    // setQueryData would have cleared the error and with it the denial.
    expect(cache.getQueryData<{ pages: unknown[] }>(keys.list)?.pages).toHaveLength(2);
    expect(cache.getQueryState(keys.list)?.error).toBeInstanceOf(ApiError);
  });

  it('rejects when an on-screen read fails, so the screen can say the data is out of date', async () => {
    const cache = seeded();
    const failing = observe(cache, keys.settlement, async () => {
      throw new ApiError('NETWORK');
    });
    const fine = observe(cache, keys.landing);
    await expect(refreshTripData(cache, BASE, USER, TRIP)).rejects.toMatchObject({
      code: 'NETWORK',
    });
    // The other reads were still attempted: one failure does not skip the rest.
    expect(fine.read).toHaveBeenCalledTimes(1);
    failing.stop();
    fine.stop();
  });

  it('succeeds when nothing is on screen', async () => {
    await expect(refreshTripData(seeded(), BASE, USER, TRIP)).resolves.toBeUndefined();
  });
});

describe('pending keys and previews', () => {
  it('scopes the pending list by environment, account and trip', () => {
    const all = [
      pendingKey(BASE, USER, TRIP),
      pendingKey(BASE, USER, OTHER_TRIP),
      pendingKey(BASE, OTHER_USER, TRIP),
      pendingKey('https://b.test/api/v1', USER, TRIP),
    ].map((key) => JSON.stringify(key));
    expect(new Set(all).size).toBe(all.length);
  });

  it('requests the preview as the given account, never as whoever is signed in', async () => {
    const requestAs = vi.fn(async () => ({ amount: 100, splits: [] }));
    const controller = new AbortController();
    await requestPreview(
      { requestAs } as never,
      USER,
      'a/b',
      { amount: 100, member_ids: ['x'.repeat(24)] },
      controller.signal
    );
    expect(requestAs).toHaveBeenCalledWith(
      USER,
      '/trips/a%2Fb/expenses/preview',
      expect.anything(),
      {
        method: 'POST',
        body: { amount: 100, member_ids: ['x'.repeat(24)] },
        signal: controller.signal,
      }
    );
  });
});

describe('member options after a refused preview', () => {
  const options = { members: [], categories: [] };
  function mounted(read: () => Promise<unknown>) {
    const cache = client();
    const manager = { api: { environment: BASE }, requestAs: vi.fn(read) };
    const query = expenseOptionsQuery(manager as never, USER, TRIP);
    const observer = new QueryObserver(cache, query);
    const stop = observer.subscribe(() => {});
    return { cache, manager, query, observer, stop };
  }

  it('stay denied through a failing reread and across re-entering, until a read succeeds', async () => {
    let answer: () => Promise<unknown> = async () => options;
    const m = mounted(() => answer());
    await m.observer.refetch();
    expect(m.observer.getCurrentResult().error).toBeNull();

    // The preview was refused: that is the options' own error from now on.
    recordAccessDenial(m.cache, m.query.queryKey, new ApiError('NOT_FOUND', 404));
    expect(isAccessDenied(m.observer.getCurrentResult().error)).toBe(true);

    answer = () => Promise.reject(new ApiError('NETWORK'));
    await m.observer.refetch();
    expect(isAccessDenied(m.observer.getCurrentResult().error)).toBe(true);
    m.stop();
    const returned = new QueryObserver(m.cache, m.query);
    expect(isAccessDenied(returned.getCurrentResult().error)).toBe(true);

    answer = async () => options;
    await returned.refetch();
    expect(returned.getCurrentResult().error).toBeNull();
  });

  it('are recorded for that trip and account only', async () => {
    const m = mounted(async () => options);
    await m.observer.refetch();
    const others = [
      [BASE, USER, 'expense-options', OTHER_TRIP],
      [BASE, OTHER_USER, 'expense-options', TRIP, 'v2'],
      ['https://b.test/api/v1', USER, 'expense-options', TRIP, 'v2'],
    ];
    for (const key of others) m.cache.setQueryData(key, options);
    recordAccessDenial(m.cache, m.query.queryKey, new ApiError('FORBIDDEN', 403));
    expect(isAccessDenied(m.cache.getQueryState(m.query.queryKey)?.error)).toBe(true);
    for (const key of others) expect(m.cache.getQueryState(key)?.error).toBeNull();
    m.stop();
  });
});

describe('D1 authorization before showing local input', () => {
  it('requires fresh account-bound authorization even when cached options are still fresh', async () => {
    const cache = client();
    let read = async () => ({ members: [], categories: [] });
    const requestAs = vi.fn(() => read());
    const query = expenseOptionsQuery(
      { api: { environment: BASE }, requestAs } as never,
      USER,
      TRIP
    );
    expect(query.refetchOnMount).toBe('always');
    cache.setQueryData(query.queryKey, { members: [], categories: [] });
    const before = cache.getQueryState(query.queryKey)!.dataUpdateCount;
    expect(canShowExpenseDraft(cache, query.queryKey, before)).toBe(false);
    const observer = new QueryObserver(cache, query);
    const stop = observer.subscribe(() => {});
    await observer.refetch();
    expect(canShowExpenseDraft(cache, query.queryKey, before)).toBe(true);
    expect(requestAs).toHaveBeenCalledWith(
      USER,
      '/trips/t1/expense-options',
      expect.anything(),
      expect.objectContaining({ signal: expect.anything() })
    );
    read = async () => {
      throw new ApiError('NETWORK');
    };
    await observer.refetch();
    // An already authorized open form may keep saving locally after connectivity is lost.
    expect(canShowExpenseDraft(cache, query.queryKey, before)).toBe(true);
    const reopened = cache.getQueryState(query.queryKey)!.dataUpdateCount;
    expect(canShowExpenseDraft(cache, query.queryKey, reopened)).toBe(false);
    recordAccessDenial(cache, query.queryKey, new ApiError('NOT_FOUND', 404));
    expect(canShowExpenseDraft(cache, query.queryKey, before)).toBe(false);
    await observer.refetch();
    expect(canShowExpenseDraft(cache, query.queryKey, before)).toBe(false);
    read = async () => ({ members: [], categories: [] });
    await observer.refetch();
    expect(canShowExpenseDraft(cache, query.queryKey, reopened)).toBe(true);
    stop();
  });
});
