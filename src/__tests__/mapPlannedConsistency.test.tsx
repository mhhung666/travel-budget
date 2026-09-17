import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tripKeys } from '@/hooks/queries/keys';
import { dateFromLocalDateKey, isPlannedTrip, localDateKey } from '@/lib/tripStatus';

const mocks = vi.hoisted(() => ({
  tripFind: vi.fn(),
  aggregate: vi.fn(),
  getVisitedPlaces: vi.fn(),
  updateTrip: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));
vi.mock('@/actions/withAuth', () => ({
  withAuth:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn({ userId: 'viewer' }, ...args),
}));
vi.mock('@/models', () => ({
  Trip: { find: mocks.tripFind },
  ItineraryDay: { aggregate: mocks.aggregate },
  Photo: {},
}));
vi.mock('@/lib/storage', () => ({ presignGetStable: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/actions', () => ({
  getVisitedPlaces: mocks.getVisitedPlaces,
  updateTrip: mocks.updateTrip,
  deleteTrip: vi.fn(),
  regenerateHashCode: vi.fn(),
  archiveTrip: vi.fn(),
  unarchiveTrip: vi.fn(),
  setTripBudget: vi.fn(),
  setTripCurrencySettings: vi.fn(),
}));

import { getVisitedPlaces } from '@/actions/map.actions';
import { useVisitedPlaces } from '@/hooks/queries/useVisitedPlaces';
import { useTripMutations } from '@/hooks/queries/useTripMutations';

const ORIGINAL_TZ = process.env.TZ;
let client: QueryClient;
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
  vi.useRealTimers();
});

describe('planned trips use the browser calendar day on both sides', () => {
  it('parses only exact local date keys', () => {
    expect(localDateKey(new Date(2026, 8, 18, 1))).toBe('2026-09-18');
    expect(dateFromLocalDateKey('2026-09-18')?.getDate()).toBe(18);
    expect(dateFromLocalDateKey('2026-09-18T00:00')).toBeNull();
    expect(dateFromLocalDateKey('2026-02-30')).toBeNull();
  });

  it("classifies with the browser's day even when the server clock is still on the previous UTC day", async () => {
    // 台灣 2026-09-18 01:00 = UTC 2026-09-17 17:00；伺服器跑在 UTC。
    process.env.TZ = 'UTC';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-17T17:00:00Z'));
    const trip = {
      _id: 'trip-1',
      startDate: new Date('2026-09-18T00:00:00Z'),
      endDate: new Date('2026-09-20T00:00:00Z'),
    };
    mocks.tripFind.mockReturnValue({ select: () => ({ lean: async () => [trip] }) });
    mocks.aggregate.mockResolvedValue([]);
    const plannedIds = () => mocks.aggregate.mock.calls.at(-1)![0][1].$addFields.planned.$in[1];

    await getVisitedPlaces({ year: null, today: '2026-09-18' });
    expect(plannedIds()).toEqual([]);
    // 瀏覽器端對目的地的判斷，與伺服器收到同一天時一致。
    expect(isPlannedTrip('2026-09-18', '2026-09-20', dateFromLocalDateKey('2026-09-18')!)).toBe(
      false
    );

    // 沒帶或帶錯格式才退回伺服器時間（仍是 09-17，所以算計畫中）。
    await getVisitedPlaces({ year: null, today: 'bogus' });
    expect(plannedIds()).toEqual(['trip-1']);
  });

  it('sends the local day to the server and keys the cache by it', async () => {
    mocks.getVisitedPlaces.mockResolvedValue({ success: true, data: [] });
    renderHook(() => useVisitedPlaces(true, 2026, '2026-09-18'), { wrapper });

    await waitFor(() =>
      expect(mocks.getVisitedPlaces).toHaveBeenCalledWith({ year: 2026, today: '2026-09-18' })
    );
    expect(client.getQueryState([...tripKeys.visitedPlaces, 2026, '2026-09-18'])).toBeDefined();
  });
});

describe('changing trip dates refreshes map classification', () => {
  it('invalidates visited places for every year when dates change', async () => {
    mocks.updateTrip.mockResolvedValue({ success: true, data: { id: 'trip' } });
    const { result } = renderHook(() => useTripMutations('trip'), { wrapper });
    const allYears = [...tripKeys.visitedPlaces, 'all', '2026-09-17'];
    const oneYear = [...tripKeys.visitedPlaces, 2026, '2026-09-17'];

    client.setQueryData(allYears, []);
    client.setQueryData(oneYear, []);
    await act(() => result.current.update.mutateAsync({ name: 'Renamed' } as never));
    expect(client.getQueryState(allYears)?.isInvalidated).toBe(false);

    await act(() => result.current.update.mutateAsync({ start_date: '2099-01-01' } as never));
    expect(client.getQueryState(allYears)?.isInvalidated).toBe(true);
    expect(client.getQueryState(oneYear)?.isInvalidated).toBe(true);
  });
});
