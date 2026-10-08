import { beforeEach, expect, it, vi } from 'vitest';
import { refreshManagedTrip } from './managementRefresh';
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
const h = vi.hoisted(() => ({ pause: vi.fn(), refresh: vi.fn(), until: 0 }));
vi.mock('@/storage/pendingExpenseDatabase', () => ({
  openMutationStore: async () => ({
    retryAt: async () => h.until,
    rateLimitUntil: () => h.until,
    pause: h.pause,
  }),
}));
vi.mock('@/features/expenses/entryQueries', () => ({ refreshTripData: h.refresh }));
const scope = { environment: 'https://test/api/v1', accountId: 'a'.repeat(24) },
  tripId = 'b'.repeat(24);
function fixture() {
  let version = 1,
    denial = 1;
  const requestAs = vi.fn(async (_actor, path, _schema, options): Promise<unknown> => {
    options?.beforeSend?.();
    return path.includes('landing') ? { name: 'New name' } : { members: [], categories: [] };
  });
  const manager = {
    api: { environment: scope.environment },
    getSignInVersion: () => version,
    getSnapshot: () => ({ status: 'signedIn', user: { id: scope.accountId } }),
    requestAs,
  };
  const catalog = {
    captureAccess: () => {
      const d = denial;
      return () => {
        if (d !== denial) throw new ApiError('CANCELLED');
      };
    },
    isVisible: () => true,
    rememberName: vi.fn(),
    rememberOptions: vi.fn(),
    deny: vi.fn(async () => undefined),
  };
  const client = new QueryClient();
  const run = () => refreshManagedTrip(client, manager as never, catalog as never, scope, tripId);
  return {
    client,
    manager,
    catalog,
    requestAs,
    run,
    changeAccount: () => {
      version++;
    },
    deny: () => {
      denial++;
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  h.until = 0;
});
it('success updates persisted name/options and invalidates reads without another write', async () => {
  const f = fixture();
  await f.run();
  expect(f.catalog.rememberName).toHaveBeenCalledWith(scope, tripId, 'New name');
  expect(f.catalog.rememberOptions).toHaveBeenCalledOnce();
  expect(h.refresh).toHaveBeenCalledOnce();
  expect(f.requestAs.mock.calls.every((call) => !call[3]?.method)).toBe(true);
});
it.each(['denial', 'account'])(
  '%s during name persistence stops options and never reveals stale roster',
  async (kind) => {
    const f = fixture();
    f.catalog.rememberName.mockImplementation(async () => {
      if (kind === 'denial') f.deny();
      else f.changeAccount();
    });
    await expect(f.run()).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(f.requestAs).toHaveBeenCalledTimes(1);
    expect(f.catalog.rememberOptions).not.toHaveBeenCalled();
  }
);
it('429 during post-commit refresh persists shared wait and still invalidates related caches', async () => {
  const f = fixture();
  f.requestAs.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  await expect(f.run()).rejects.toMatchObject({ status: 429 });
  expect(h.pause).toHaveBeenCalledWith(scope, expect.any(Number));
  expect(h.refresh).toHaveBeenCalledOnce();
});
it('known shared waiting deadline prevents all new reads', async () => {
  const f = fixture();
  h.until = Date.now() + 120000;
  await expect(f.run()).rejects.toMatchObject({ status: 429 });
  expect(f.requestAs).not.toHaveBeenCalled();
  expect(h.pause).not.toHaveBeenCalled();
});
it('a membership denial after commit hides the trip through existing catalog guard', async () => {
  const f = fixture();
  f.requestAs.mockRejectedValueOnce(new ApiError('NOT_FOUND', 404));
  await expect(f.run()).rejects.toMatchObject({ status: 404 });
  expect(f.catalog.deny).toHaveBeenCalledWith(scope, tripId);
});

it('a late old options response cannot replace the refreshed roster or virtual flag', async () => {
  const f = fixture(),
    key = [scope.environment, scope.accountId, 'expense-options', tripId, 'v2'];
  let resolve!: (data: unknown) => void;
  const old = f.client
    .fetchQuery({
      queryKey: key,
      queryFn: () =>
        new Promise((r) => {
          resolve = r;
        }),
    })
    .catch(() => undefined);
  const fresh = {
    members: [{ id: 'd'.repeat(24), displayName: 'Renamed', isVirtual: true }],
    categories: [],
  };
  f.requestAs.mockImplementation(async (_actor, path, _schema, options) => {
    options?.beforeSend?.();
    return path.includes('landing') ? { name: 'Trip' } : fresh;
  });
  await f.run();
  resolve({ members: [{ id: 'd'.repeat(24), displayName: 'Old' }], categories: [] });
  await old;
  expect(f.client.getQueryData(key)).toEqual(fresh);
});
it('denial during options persistence stops publication to the label cache', async () => {
  const f = fixture();
  f.catalog.rememberOptions.mockImplementation(async () => {
    f.deny();
  });
  await expect(f.run()).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(
    f.client.getQueryData([scope.environment, scope.accountId, 'expense-options', tripId, 'v2'])
  ).toBeUndefined();
});
