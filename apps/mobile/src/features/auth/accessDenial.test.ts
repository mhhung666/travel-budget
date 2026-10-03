import {
  InfiniteQueryObserver,
  QueryClient,
  QueryObserver,
  type QueryKey,
} from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { expenseQuery, expensesQuery, keepFirstPage } from '@/features/expenses/queries';
import { settlementQuery } from '@/features/settlement/queries';
import { tripQuery } from '@/features/trips/queries';
import { isAccessDenied } from './errorMessage';

// The hooks need React auth context and native modules; only the query option factories are under test.
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('react-native', () => ({ AppState: { addEventListener: vi.fn() } }));

type Mode = 'ok' | 'denied' | 'timeout' | 'network' | 'server';
const BASE = 'https://a.test/api/v1';
const world = { mode: 'ok' as Mode };
const expense = { id: 'e1', description: 'Private lunch' };
const payloads: [RegExp, unknown][] = [
  [/\/expenses\/[^/?]+$/, { ...expense, splits: [] }],
  [/\/expenses(\?.*)?$/, { items: [expense], nextCursor: null }],
  [/\/settlement$/, { status: 'outstanding', balances: [] }],
  [/\/landing/, { id: 't1', name: 'Private trip' }],
];
const manager = {
  api: { baseUrl: BASE },
  request: vi.fn(async (path: string) => {
    if (world.mode === 'denied') throw new ApiError('NOT_FOUND', 404);
    if (world.mode === 'timeout') throw new ApiError('TIMEOUT');
    if (world.mode === 'network') throw new ApiError('NETWORK');
    if (world.mode === 'server') throw new ApiError('SERVER_ERROR', 503);
    return payloads.find(([pattern]) => pattern.test(path))?.[1];
  }) as never,
};
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

type Result = { data: unknown; error: unknown };
type Resource = {
  name: string;
  key: QueryKey;
  observe: (c: QueryClient) => {
    refetch: () => Promise<Result>;
    stop: () => void;
    read: () => Result;
  };
};
function single(options: ConstructorParameters<typeof QueryObserver>[1]): Resource['observe'] {
  return (c) => {
    const observer = new QueryObserver(c, options);
    const stop = observer.subscribe(() => {});
    return { refetch: () => observer.refetch(), stop, read: () => observer.getCurrentResult() };
  };
}
const resources: Resource[] = [
  {
    name: 'expense list',
    key: expensesQuery(manager, 'u1', 't1').queryKey,
    observe: (c) => {
      const observer = new InfiniteQueryObserver(c, expensesQuery(manager, 'u1', 't1'));
      const stop = observer.subscribe(() => {});
      return { refetch: () => observer.refetch(), stop, read: () => observer.getCurrentResult() };
    },
  },
  {
    name: 'expense detail',
    key: expenseQuery(manager, 'u1', 't1', 'e1').queryKey,
    observe: single(expenseQuery(manager, 'u1', 't1', 'e1') as never),
  },
  {
    name: 'settlement',
    key: settlementQuery(manager, 'u1', 't1').queryKey,
    observe: single(settlementQuery(manager, 'u1', 't1') as never),
  },
  {
    name: 'trip summary',
    key: tripQuery(manager, 'u1', 't1', '2026-10-03').queryKey,
    observe: single(tripQuery(manager, 'u1', 't1', '2026-10-03') as never),
  },
];
beforeEach(() => {
  world.mode = 'ok';
});

describe.each(resources)('lost access to the $name', ({ key, observe }) => {
  it.each(['timeout', 'network', 'server'] as const)(
    'stays denied when a retry then fails with %s, even after leaving and returning',
    async (failure) => {
      const c = client();
      const first = observe(c);
      await first.refetch();
      expect(first.read().data).toBeDefined();

      world.mode = 'denied';
      await first.refetch();
      expect(isAccessDenied(first.read().error)).toBe(true);

      // The member retries while the network is bad: the denial must not be forgotten.
      world.mode = failure;
      await first.refetch();
      expect(isAccessDenied(first.read().error)).toBe(true);

      // Leave the screen and come back: the cached entry is read again by a new observer.
      first.stop();
      const returned = observe(c);
      expect(isAccessDenied(returned.read().error)).toBe(true);
      await returned.refetch();
      expect(isAccessDenied(returned.read().error)).toBe(true);
      expect(isAccessDenied(c.getQueryState(key)?.error)).toBe(true);
    }
  );

  it('shows the data again once access is restored and a read succeeds', async () => {
    const c = client();
    const view = observe(c);
    await view.refetch();
    world.mode = 'denied';
    await view.refetch();
    world.mode = 'timeout';
    await view.refetch();
    world.mode = 'ok';
    await view.refetch();
    expect(view.read().error).toBeNull();
    expect(view.read().data).toBeDefined();
  });

  it.each(['timeout', 'network', 'server'] as const)(
    'keeps legitimate stale data visible for an ordinary %s failure',
    async (failure) => {
      const c = client();
      const view = observe(c);
      await view.refetch();
      world.mode = failure;
      await view.refetch();
      expect(view.read().error).toBeInstanceOf(ApiError);
      expect(isAccessDenied(view.read().error)).toBe(false);
      expect(view.read().data).toBeDefined();
    }
  );
});

describe('expense list pull-to-refresh after lost access', () => {
  const key = expensesQuery(manager, 'u1', 't1').queryKey;
  const listObserver = (c: QueryClient) => {
    const observer = new InfiniteQueryObserver(c, expensesQuery(manager, 'u1', 't1'));
    observer.subscribe(() => {});
    return observer;
  };

  it('does not lift a recorded denial by truncating the cache', async () => {
    const c = client();
    const observer = listObserver(c);
    await observer.refetch();
    world.mode = 'denied';
    await observer.refetch();
    keepFirstPage(c, key);
    expect(isAccessDenied(c.getQueryState(key)?.error)).toBe(true);
    expect(isAccessDenied(observer.getCurrentResult().error)).toBe(true);
  });

  it.each(['timeout', 'network', 'server'] as const)(
    'stays denied when the refresh itself fails with %s',
    async (failure) => {
      const c = client();
      const observer = listObserver(c);
      await observer.refetch();
      world.mode = 'denied';
      await observer.refetch();
      world.mode = failure;
      keepFirstPage(c, key);
      await observer.refetch();
      expect(isAccessDenied(observer.getCurrentResult().error)).toBe(true);
    }
  );

  it('still rereads only the newest page while access is intact', async () => {
    const c = client();
    const observer = listObserver(c);
    await observer.refetch();
    keepFirstPage(c, key);
    await observer.refetch();
    expect(observer.getCurrentResult().data?.pages).toHaveLength(1);
    expect(observer.getCurrentResult().error).toBeNull();
  });
});
