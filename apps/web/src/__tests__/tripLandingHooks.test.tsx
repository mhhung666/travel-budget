import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  path: '/trips/abc12345',
  authenticated: true,
  landing: vi.fn(),
  shell: vi.fn(),
  trip: vi.fn(),
  itinerary: vi.fn(),
}));
vi.mock('@/i18n/navigation', () => ({ usePathname: () => mocks.path }));
vi.mock('@/components/providers/QueryProvider', () => ({
  useAuthenticatedSession: () => mocks.authenticated,
}));
vi.mock('@/actions/tripLanding.actions', () => ({ getTripLanding: mocks.landing }));
vi.mock('@/actions', () => ({
  getTripShell: mocks.shell,
  getTrip: mocks.trip,
  getItinerary: mocks.itinerary,
}));
import { useTripShell, useTrip, useItinerary } from '@/hooks/queries/useTripQueries';
import { clearTripAccessModes } from '@/hooks/queries/fetcher';
const payload = {
  shell: { id: 'trip', name: 'Tokyo' },
  trip: { id: 'trip', name: 'Tokyo' },
  itinerary: [],
  checklists: [],
  settlement: null,
};
function Page() {
  const trip = useTrip('abc12345');
  const itinerary = useItinerary('abc12345');
  return (
    <span>
      {trip.data?.name} {itinerary.isSuccess ? 'ready' : 'loading'}
    </span>
  );
}
function Shell({ children }: { children?: React.ReactNode }) {
  const shell = useTripShell('abc12345');
  return (
    <div>
      {shell.data?.name}
      {children}
    </div>
  );
}
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  clearTripAccessModes();
  mocks.path = '/trips/abc12345';
  mocks.authenticated = true;
  mocks.landing.mockResolvedValue({ success: true, data: payload });
  mocks.shell.mockResolvedValue({ success: true, data: payload.shell });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
describe('landing hook wiring', () => {
  it('coalesces the mounted shell and page into one authenticated bootstrap', async () => {
    const view = render(
      <QueryClientProvider client={client}>
        <Shell>
          <Page />
        </Shell>
      </QueryClientProvider>
    );
    await waitFor(() => expect(view.getByText(/ready/)).toBeTruthy());
    expect(mocks.landing).toHaveBeenCalledOnce();
    expect(mocks.shell).not.toHaveBeenCalled();
    expect(mocks.trip).not.toHaveBeenCalled();
    expect(mocks.itinerary).not.toHaveBeenCalled();
  });
  it('loads a public landing with one GET and no authenticated action', async () => {
    mocks.authenticated = false;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', fetchMock);
    const view = render(
      <QueryClientProvider client={client}>
        <Shell>
          <Page />
        </Shell>
      </QueryClientProvider>
    );
    await waitFor(() => expect(view.getByText(/ready/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/landing?date='));
    expect(mocks.landing).not.toHaveBeenCalled();
    expect(mocks.trip).not.toHaveBeenCalled();
  });
  it('keeps other tabs on the lightweight shell request', async () => {
    mocks.path = '/trips/abc12345/expenses';
    const view = render(
      <QueryClientProvider client={client}>
        <Shell />
      </QueryClientProvider>
    );
    await waitFor(() => expect(view.getByText('Tokyo')).toBeTruthy());
    expect(mocks.shell).toHaveBeenCalledOnce();
    expect(mocks.landing).not.toHaveBeenCalled();
  });
});
