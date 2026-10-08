import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { expenseOptionsQuery } from './entryQueries';
import { tripMemberQuery, useTripMembers } from './useTripMembers';

const h = vi.hoisted(() => ({
  account: '0123456789abcdef01a1b2c3',
  environment: 'https://test/api/v1',
  status: 'signedIn',
  visible: true,
  error: undefined as unknown,
  request: vi.fn(),
  query: vi.fn(),
  refetch: vi.fn(),
}));
const roster = [{ id: '0123456789abcdef01a1b2c3', displayName: 'Alice' }];
const manager = {
  api: {
    get environment() {
      return h.environment;
    },
  },
  requestAs: h.request,
};
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ manager, user: { id: h.account }, status: h.status }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({ catalog: { isVisible: () => h.visible } }),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: (options: unknown) => {
    h.query(options);
    return { data: { members: roster }, error: h.error, refetch: h.refetch };
  },
}));
const cleanups: (() => void)[] = [];
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
beforeEach(() => {
  h.account = roster[0].id;
  h.environment = 'https://test/api/v1';
  h.status = 'signedIn';
  h.visible = true;
  h.error = undefined;
  vi.clearAllMocks();
});
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach((f) => f())
);
it.each([false, true])(
  'shares TripChrome reads with screen observers, warm cache=%s',
  async (warm) => {
    const client = new QueryClient();
    cleanups.push(() => client.clear());
    const options = expenseOptionsQuery(manager, h.account, 'trip');
    const labels = tripMemberQuery(manager, h.account, 'trip');
    expect(labels.queryKey).toEqual(options.queryKey);
    expect(labels.refetchOnMount).toBe(false);
    let resolve!: (value: unknown) => void;
    h.request.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    if (warm) client.setQueryData(options.queryKey, { members: roster, categories: ['food'] });
    const owner = new QueryObserver(client, options);
    cleanups.push(owner.subscribe(() => undefined));
    for (let i = 0; i < 2; i++) {
      const observer = new QueryObserver(client, labels);
      cleanups.push(observer.subscribe(() => undefined));
    }
    await flush();
    expect(h.request).toHaveBeenCalledTimes(1);
    resolve({ members: roster, categories: ['food'] });
    await flush();
    const detail = new QueryObserver(client, labels);
    cleanups.push(detail.subscribe(() => undefined));
    await flush();
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(detail.getCurrentResult().data?.members).toEqual(roster);
  }
);
it('keeps warm cached roster reads passive, keys private scopes, and fetches a cold direct entry', async () => {
  const client = new QueryClient();
  cleanups.push(() => client.clear());
  const options = tripMemberQuery(manager, h.account, 'trip');
  client.setQueryData(options.queryKey, { members: roster, categories: ['food'] });
  const cached = new QueryObserver(client, options);
  cleanups.push(cached.subscribe(() => undefined));
  await flush();
  expect(h.request).not.toHaveBeenCalled();
  h.request.mockResolvedValue({ members: [], categories: [] });
  const other = tripMemberQuery(manager, 'other', 'trip');
  expect(other.queryKey).not.toEqual(options.queryKey);
  const cold = new QueryObserver(client, other);
  cleanups.push(cold.subscribe(() => undefined));
  await flush();
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(h.request.mock.calls[0][0]).toBe('other');
  h.environment = 'https://other/api/v1';
  expect(tripMemberQuery(manager, h.account, 'trip').queryKey).not.toEqual(options.queryKey);
});
it.each(['catalog', 'http', 'local'] as const)(
  'withholds cached roster after %s denial',
  (source) => {
    if (source === 'catalog') h.visible = false;
    if (source === 'http') h.error = new ApiError('FORBIDDEN', 403);
    if (source === 'local') h.status = 'local';
    const result = useTripMembers('trip');
    expect(result.denied).toBe(true);
    expect(result.roster).toBeUndefined();
    if (source !== 'http') expect(h.query.mock.calls[0][0].enabled).toBe(false);
  }
);
it('does not enable a second roster read when a form already supplies its own context', () => {
  const members = useTripMembers('trip', false);
  expect(h.query.mock.calls[0][0].enabled).toBe(false);
  members.refresh();
  members.refetch();
  expect(h.refetch).not.toHaveBeenCalled();
});
it('skips routine refresh of a hidden trip while preserving explicit access retry', () => {
  h.visible = false;
  const members = useTripMembers('trip');
  members.refresh();
  expect(h.refetch).not.toHaveBeenCalled();
  members.refetch();
  expect(h.refetch).toHaveBeenCalledOnce();
});
it('refreshes visible roster normally, and cannot manually read in local mode', () => {
  useTripMembers('trip').refresh();
  expect(h.refetch).toHaveBeenCalledOnce();
  h.refetch.mockClear();
  h.status = 'local';
  const local = useTripMembers('trip');
  local.refresh();
  local.refetch();
  expect(h.refetch).not.toHaveBeenCalled();
});
