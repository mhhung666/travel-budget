import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const actions = vi.hoisted(() =>
  Object.fromEntries(
    [
      'getCurrentUser',
      'getMembers',
      'getCopyableChecklists',
      'getFriends',
      'getCollections',
      'getTripCollectionLinks',
      'getMapPhotos',
      'getVisitedPlaces',
      'getComments',
      'getCommentCounts',
      'getNotifications',
      'getUnreadNotificationCount',
    ].map((name) => [name, vi.fn()])
  )
);
vi.mock('@/actions', () => actions);
vi.mock('@/actions/tripLanding.actions', () => ({ getTripLanding: vi.fn() }));
vi.mock('@/components/providers/QueryProvider', () => ({ useAuthenticatedSession: () => true }));
vi.mock('@/lib/offlineMutations', () => ({ unwrap: vi.fn() }));
import {
  useCurrentUser,
  useTripMembership,
  useCopyableChecklists,
} from '@/hooks/queries/useTripQueries';
import { useFriends } from '@/hooks/queries/useFriends';
import { useCollections, useTripCollectionLinks } from '@/hooks/queries/useCollections';
import { useMapPhotos } from '@/hooks/queries/useMapPhotos';
import { useVisitedPlaces } from '@/hooks/queries/useVisitedPlaces';
import { useExpenseComments, useCommentCounts } from '@/hooks/queries/useComments';
import { useNotificationList, useUnreadNotificationCount } from '@/hooks/queries/useNotifications';
import { useExchangeRates } from '@/hooks/queries/useExchangeRates';
import { QueryStatus } from '@/components/common/QueryStatus';
import { clearTripAccessModes } from '@/hooks/queries/fetcher';

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  clearTripAccessModes();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const cases = [
  { action: 'getCurrentUser', useRead: () => useCurrentUser(), empty: null },
  {
    action: 'getCopyableChecklists',
    useRead: () => useCopyableChecklists('trip', true),
    empty: [],
  },
  {
    action: 'getFriends',
    useRead: () => useFriends(),
    empty: { friends: [], incoming: [], outgoing: [] },
  },
  {
    action: 'getCollections',
    useRead: () => useCollections(),
    empty: { flights: [], stays: [], countries: [] },
  },
  {
    action: 'getTripCollectionLinks',
    useRead: () => useTripCollectionLinks('trip'),
    empty: { flight_activity_ids: [], stay_activity_ids: [] },
  },
  { action: 'getMapPhotos', useRead: () => useMapPhotos(true, null), empty: [] },
  { action: 'getVisitedPlaces', useRead: () => useVisitedPlaces(true, null), empty: [] },
  { action: 'getComments', useRead: () => useExpenseComments('trip', 'expense', true), empty: [] },
  { action: 'getCommentCounts', useRead: () => useCommentCounts('trip'), empty: {} },
  { action: 'getNotifications', useRead: () => useNotificationList(), empty: [] },
  {
    action: 'getUnreadNotificationCount',
    useRead: () => useUnreadNotificationCount(),
    empty: { count: 0 },
  },
];

describe.each(cases)('$action', ({ action, useRead, empty }) => {
  function Probe() {
    const query = useRead();
    return (
      <QueryStatus query={query}>
        <p>successful-content</p>
      </QueryStatus>
    );
  }
  it('reports errors without successful empty/null data and retries to a real success', async () => {
    actions[action].mockResolvedValueOnce({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'internal detail',
    });
    actions[action].mockResolvedValueOnce({ success: true, data: empty });
    render(<Probe />, { wrapper });
    await screen.findByText('queryLoadFailed');
    expect(screen.queryByText('successful-content')).not.toBeInTheDocument();
    expect(screen.queryByText('internal detail')).not.toBeInTheDocument();
    expect(client.getQueryCache().getAll()[0].state.error).toMatchObject({
      code: 'INTERNAL_ERROR',
    });
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await screen.findByText('successful-content');
  });
  it('retains successful data after a failed background refresh', async () => {
    actions[action].mockResolvedValueOnce({ success: true, data: empty });
    actions[action].mockRejectedValue(new Error('connection lost'));
    render(<Probe />, { wrapper });
    await screen.findByText('successful-content');
    await act(async () => {
      await client.invalidateQueries();
    });
    await screen.findByText('queryRefreshFailed');
    expect(screen.getByText('successful-content')).toBeInTheDocument();
  });
});

it('does not resolve a failed user read as logged out, or grant membership from stale identity', async () => {
  actions.getCurrentUser.mockResolvedValue({
    success: false,
    error: 'INTERNAL_ERROR',
    code: 'INTERNAL_ERROR',
  });
  actions.getMembers.mockResolvedValue({ success: true, data: [{ id: 'user', role: 'admin' }] });
  const { result } = renderHook(() => useTripMembership('trip'), { wrapper });
  await waitFor(() => expect(result.current.query.isError).toBe(true));
  expect(result.current.isResolved).toBe(false);
  expect(result.current.isMember).toBe(false);
  actions.getCurrentUser.mockResolvedValue({ success: true, data: { id: 'user' } });
  await act(async () => {
    await result.current.query.refetch();
  });
  await waitFor(() => expect(result.current.isAdmin).toBe(true));
  actions.getCurrentUser.mockResolvedValue({ success: false, error: 'INTERNAL_ERROR' });
  await act(async () => {
    await result.current.query.refetch();
  });
  await waitFor(() => expect(result.current.isResolved).toBe(false));
  expect(result.current.isMember).toBe(false);
});

it('recognizes successful auth-null as a resolved anonymous session', async () => {
  actions.getCurrentUser.mockResolvedValue({ success: true, data: null });
  actions.getMembers.mockResolvedValue({ success: true, data: [] });
  const { result } = renderHook(() => useTripMembership('trip'), { wrapper });
  await waitFor(() => expect(result.current.isResolved).toBe(true));
  expect(result.current.currentUser).toBeNull();
  expect(result.current.isMember).toBe(false);
});

it('keeps disabled metadata reads dormant', () => {
  renderHook(
    () => {
      useFriends(false);
      useCollections(false);
      useTripCollectionLinks('trip', false);
      useCopyableChecklists('trip', false);
      useExpenseComments('trip', 'expense', false);
      useNotificationList(false);
      useUnreadNotificationCount(false);
      useMapPhotos(false, null);
      useVisitedPlaces(false, null);
      useCurrentUser(false);
    },
    { wrapper }
  );
  for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
});

it('does not store an exchange-rate service failure as successful TWD-only data', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) })
  );
  const { result } = renderHook(() => useExchangeRates(), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(client.getQueryData(['exchangeRates'])).toBeUndefined();
});
