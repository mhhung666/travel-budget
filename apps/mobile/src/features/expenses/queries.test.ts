import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type { expensesSchema } from '@/api/contracts';
import { settlementQuery } from '@/features/settlement/queries';
import { expenseQuery, expensesQuery, keepFirstPage } from './queries';

// The hooks need React auth context; only the query option factories are under test.
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: vi.fn() }));

type Page = z.infer<typeof expensesSchema>;
const id = '507f191e810c19729de860ea';
const item = (n: number) => ({
  id: String(n).padStart(24, '0'),
  date: '2026-10-02',
  description: `Expense ${n}`,
  category: 'food' as const,
  payerId: id,
  payerName: 'Amy',
  amount: n,
  originalAmount: n,
  currency: 'TWD',
});
type Request = (path: string) => Promise<unknown>;
const manager = (request: Request, baseUrl = 'https://a.test/api/v1') => ({
  api: { baseUrl },
  request: request as never,
});
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('expense queries', () => {
  it('reads the first page without a cursor, then follows the returned cursor', async () => {
    const pages: Page[] = [
      { items: [item(2), item(1)], nextCursor: '1760000000000.1760000000001.abc' },
      { items: [item(0)], nextCursor: null },
    ];
    let served = 0;
    const request = vi.fn<Request>(async () => pages[served++]);
    const data = await client().fetchInfiniteQuery({
      ...expensesQuery(manager(request), 'u1', 'trip1'),
      pages: 2,
    });
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      '/trips/trip1/expenses',
      '/trips/trip1/expenses?cursor=1760000000000.1760000000001.abc',
    ]);
    expect(data.pages).toEqual(pages);
    expect(data.pageParams).toEqual([null, '1760000000000.1760000000001.abc']);
  });
  it('stops paging when the server has no further cursor', () => {
    const { getNextPageParam } = expensesQuery(manager(vi.fn<Request>()), 'u1', 'trip1');
    expect(getNextPageParam({ items: [], nextCursor: null }, [], null, [])).toBeUndefined();
  });
  it('encodes path and cursor values', async () => {
    const request = vi.fn<Request>(async () => ({ items: [], nextCursor: null }));
    const options = expensesQuery(manager(request), 'u1', 'a/b');
    await client().fetchInfiniteQuery({ ...options });
    await client().fetchInfiniteQuery({ ...options, initialPageParam: 'x y&z' });
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      '/trips/a%2Fb/expenses',
      '/trips/a%2Fb/expenses?cursor=x%20y%26z',
    ]);
    const detail = expenseQuery(manager(request), 'u1', 'a/b', 'e 1');
    await client().fetchQuery(detail);
    expect(request.mock.calls.at(-1)?.[0]).toBe('/trips/a%2Fb/expenses/e%201');
  });
  it('scopes every key by environment and account, and stays idle while signed out', () => {
    const request = vi.fn<Request>();
    const keys = [
      expensesQuery(manager(request), 'u1', 't').queryKey,
      expensesQuery(manager(request), 'u2', 't').queryKey,
      expensesQuery(manager(request, 'https://b.test/api/v1'), 'u1', 't').queryKey,
      expenseQuery(manager(request), 'u1', 't', 'e').queryKey,
      settlementQuery(manager(request), 'u1', 't').queryKey,
      settlementQuery(manager(request), 'u2', 't').queryKey,
    ].map((key) => JSON.stringify(key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toContain('https://a.test/api/v1');
    expect(keys[0]).toContain('"u1"');
    expect(expensesQuery(manager(request), undefined, 't').enabled).toBe(false);
    expect(expenseQuery(manager(request), undefined, 't', 'e').enabled).toBe(false);
    expect(settlementQuery(manager(request), undefined, 't').enabled).toBe(false);
  });
  it('rereads only the newest page on refresh and leaves other queries alone', () => {
    const cache = client();
    const key = ['https://a.test/api/v1', 'u1', 'expenses', 'trip1'];
    const other = ['https://a.test/api/v1', 'u1', 'expenses', 'trip2'];
    const data = (n: number) => ({
      pages: Array.from({ length: n }, (_, i) => ({ items: [item(i)], nextCursor: `c${i}` })),
      pageParams: [null, 'c0', 'c1'].slice(0, n),
    });
    cache.setQueryData(key, data(3));
    cache.setQueryData(other, data(2));
    keepFirstPage(cache, key);
    expect(cache.getQueryData<ReturnType<typeof data>>(key)).toEqual(data(1));
    expect(cache.getQueryData<ReturnType<typeof data>>(other)).toEqual(data(2));
    // No cached data: nothing is created.
    keepFirstPage(cache, ['missing']);
    expect(cache.getQueryData(['missing'])).toBeUndefined();
  });
});
