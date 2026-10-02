import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { TripRefreshIndicator } from '@/components/trips/space/TripRefreshIndicator';
import { BackgroundRefreshContext } from '@/components/common/QueryFeedback';
import { QueryStatus } from '@/components/common/QueryStatus';

function Read({ name }: { name: string }) {
  const query = useQuery({
    queryKey: ['trip', 'test', name],
    initialData: [],
    queryFn: () => new Promise<never>(() => {}),
  });
  return <QueryStatus query={query} />;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('shows one delayed refresh status for multiple cached reads', async () => {
  vi.useFakeTimers();
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <BackgroundRefreshContext.Provider value={true}>
        <TripRefreshIndicator tripId="test" />
        <Read name="shell" />
        <Read name="itinerary" />
        <Read name="checklists" />
      </BackgroundRefreshContext.Provider>
    </QueryClientProvider>
  );
  expect(screen.queryByText('queryRefreshing')).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(610);
  });
  expect(screen.getAllByText('queryRefreshing')).toHaveLength(1);
  await act(async () => {
    await client.cancelQueries();
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.queryByText('queryRefreshing')).toBeNull();
  client.clear();
});

it('keeps refresh failures and retry available inside the shared indicator scope', () => {
  const refetch = vi.fn();
  render(
    <BackgroundRefreshContext.Provider value={true}>
      <QueryStatus query={{ data: [], isError: true, refetch }} />
    </BackgroundRefreshContext.Provider>
  );
  expect(screen.getByRole('alert')).toHaveTextContent('queryRefreshFailed');
  screen.getByRole('button', { name: 'retry' }).click();
  expect(refetch).toHaveBeenCalledOnce();
});
