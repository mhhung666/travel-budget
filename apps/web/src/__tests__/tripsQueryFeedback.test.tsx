import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripWithMembers } from '@/types';

const mocks = vi.hoisted(() => ({ getTrips: vi.fn(), push: vi.fn() }));
vi.mock('@/actions', () => ({ getTrips: mocks.getTrips }));
vi.mock('@/actions/tripLanding.actions', () => ({ getTripLanding: vi.fn() }));
vi.mock('@/components/providers/QueryProvider', () => ({ useAuthenticatedSession: () => true }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/hooks/queries', async () => {
  const { useTrips } = await import('@/hooks/queries/useTripQueries');
  const { tripKeys } = await import('@/hooks/queries/keys');
  return { useTrips, tripKeys, useTripArchiveMutations: () => ({}) };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/trips/DeferredDialogs', () => ({
  CreateTripDialog: ({
    open,
    onSuccess,
  }: {
    open: boolean;
    onSuccess: (trip: { id: string }) => void;
  }) =>
    open ? (
      <button onClick={() => onSuccess({ id: 'committed-trip' })}>finish creation</button>
    ) : null,
  JoinTripDialog: () => null,
  TripExpenseQuickAdd: () => null,
}));
vi.mock('@/components/trips/TripList', () => ({
  default: ({ trips }: { trips: TripWithMembers[] }) => (
    <div>{trips.map((trip) => trip.name).join(',')}</div>
  ),
}));
vi.mock('@/components/trips/EmptyTripsState', () => ({
  default: ({ onCreate }: { onCreate: () => void }) => (
    <div>
      <p>empty-trips</p>
      <button onClick={onCreate}>createTrip</button>
    </div>
  ),
}));
vi.mock('@/components/skeletons', () => ({ TripsPageSkeleton: () => <p>trip-skeleton</p> }));
vi.mock('@/components/map', () => ({
  TripMapView: ({ loading }: { loading: boolean }) => (
    <p>{loading ? 'map-loading' : 'map-ready'}</p>
  ),
}));

import TripsPage from '@/app/(app)/trips/page';
import MapPage from '@/app/(app)/map/page';
import { TripLinkSelect } from '@/components/collections/RecordFormFields';
import { useTrips } from '@/hooks/queries/useTripQueries';
import { tripKeys } from '@/hooks/queries/keys';
import { ActionQueryError, unwrapActionResult } from '@/lib/actionQuery';

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
});
function mount() {
  return render(
    <QueryClientProvider client={client}>
      <TripsPage />
    </QueryClientProvider>
  );
}
describe('trip list query feedback', () => {
  it('navigates to the created ID when only a commit receipt is returned', async () => {
    mocks.getTrips.mockResolvedValue({ success: true, data: [] });
    mount();
    await screen.findByText('empty-trips');
    fireEvent.click(screen.getByRole('button', { name: 'createTrip' }));
    fireEvent.click(await screen.findByRole('button', { name: 'finish creation' }));
    expect(mocks.push).toHaveBeenCalledWith('/trips/committed-trip');
  });
  it('preserves the cached map on background failure', async () => {
    client.setQueryData(tripKeys.list, []);
    mocks.getTrips.mockResolvedValue({ success: false, error: 'INTERNAL_ERROR' });
    render(
      <QueryClientProvider client={client}>
        <MapPage />
      </QueryClientProvider>
    );
    await screen.findByText('queryRefreshFailed');
    expect(screen.getByText('map-ready')).toBeInTheDocument();
    expect(screen.queryByText('map-loading')).not.toBeInTheDocument();
  });

  it('disables a failed trip selector and retries without submitting its parent form', async () => {
    mocks.getTrips.mockResolvedValue({ success: false, error: 'INTERNAL_ERROR' });
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <QueryClientProvider client={client}>
        <form onSubmit={submit}>
          <TripLinkSelect value={null} onChange={vi.fn()} />
        </form>
      </QueryClientProvider>
    );
    await screen.findByText('queryLoadFailed');
    expect(screen.getByRole('combobox')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.getTrips).toHaveBeenCalledTimes(2));
  });

  it('preserves the failure code and successful null/empty values', () => {
    expect(unwrapActionResult({ success: true, data: null })).toBeNull();
    expect(unwrapActionResult({ success: true, data: [] })).toEqual([]);
    try {
      unwrapActionResult({ success: false, error: 'db unavailable', code: 'INTERNAL_ERROR' });
      expect.fail('must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ActionQueryError);
      expect(error).toMatchObject({ message: 'db unavailable', code: 'INTERNAL_ERROR' });
    }
  });

  it('shows a retryable error, not empty trips, and recovers on retry', async () => {
    mocks.getTrips.mockResolvedValueOnce({ success: false, error: 'INTERNAL_ERROR' });
    mocks.getTrips.mockResolvedValueOnce({ success: true, data: [] });
    mount();
    await screen.findByText('queryLoadFailed');
    expect(screen.queryByText('empty-trips')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await screen.findByText('empty-trips');
    expect(mocks.getTrips).toHaveBeenCalledTimes(2);
  });

  it('keeps cached rows during refetch and after a transport failure', async () => {
    client.setQueryData(tripKeys.list, [{ id: 'trip', name: 'Cached trip', archived_at: null }]);
    let reject!: (reason: Error) => void;
    mocks.getTrips.mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    mount();
    await screen.findByText('queryRefreshing');
    expect(screen.getByText('Cached trip')).toBeInTheDocument();
    expect(screen.queryByText('trip-skeleton')).not.toBeInTheDocument();
    await act(async () => reject(new Error('offline')));
    await screen.findByText('queryRefreshFailed');
    expect(screen.getByText('Cached trip')).toBeInTheDocument();
  });

  it('distinguishes a cached empty list from missing data on refresh failure', async () => {
    client.setQueryData(tripKeys.list, []);
    mocks.getTrips.mockResolvedValue({ success: false, error: 'INTERNAL_ERROR' });
    mount();
    await screen.findByText('queryRefreshFailed');
    expect(screen.getByText('empty-trips')).toBeInTheDocument();
    expect(screen.queryByText('queryLoadFailed')).not.toBeInTheDocument();
  });

  it('does not fetch disabled trips, then fetches when enabled', async () => {
    function Probe({ enabled }: { enabled: boolean }) {
      const query = useTrips(enabled);
      return <span>{query.isSuccess ? 'ready' : 'waiting'}</span>;
    }
    mocks.getTrips.mockResolvedValue({ success: true, data: [] });
    const view = render(
      <QueryClientProvider client={client}>
        <Probe enabled={false} />
      </QueryClientProvider>
    );
    expect(mocks.getTrips).not.toHaveBeenCalled();
    view.rerender(
      <QueryClientProvider client={client}>
        <Probe enabled />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());
    expect(mocks.getTrips).toHaveBeenCalledOnce();
  });
});
