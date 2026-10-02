import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PlanNoteSheet } from '@/components/trips/DeferredDialogs';
import { PhotoLightbox } from '@/components/trips/detail/album/DeferredPhotoLightbox';

const mocks = vi.hoisted(() => ({ days: vi.fn(), photoModule: vi.fn(), photoRender: vi.fn() }));
vi.mock('@/actions', () => ({ getItinerary: mocks.days }));
vi.mock('@/actions/tripLanding.actions', () => ({ getTripLanding: vi.fn() }));
vi.mock('@/components/providers/QueryProvider', () => ({ useAuthenticatedSession: () => true }));
vi.mock('@/hooks/queries', async () => {
  const { useItinerary } = await import('@/hooks/queries/useTripQueries');
  return { useItinerary };
});
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/trips/trip/notes',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/components/trips/detail/album/PhotoLightbox', () => {
  mocks.photoModule();
  return {
    PhotoLightbox: (props: { index: number | null; onIndexChange: (n: number | null) => void }) => {
      mocks.photoRender(props.index);
      return props.index === null ? null : (
        <button onClick={() => props.onIndexChange(null)}>photo {props.index}</button>
      );
    },
  };
});

afterEach(cleanup);

it('loads note metadata only on open and reuses fresh QueryClient data across close/reopen', async () => {
  mocks.days.mockResolvedValue({ success: true, data: [] });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  const close = vi.fn();
  const ui = (open: boolean) => (
    <QueryClientProvider client={client}>
      <PlanNoteSheet
        open={open}
        tripId="trip"
        pending={false}
        onPickDay={vi.fn()}
        onClose={close}
      />
    </QueryClientProvider>
  );
  const view = render(ui(false));
  expect(mocks.days).not.toHaveBeenCalled();
  view.rerender(ui(true));
  await screen.findByText('noDays');
  expect(mocks.days).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
  view.rerender(ui(false));
  await client.invalidateQueries();
  expect(mocks.days).toHaveBeenCalledTimes(1);
  view.rerender(ui(true));
  await waitFor(() => expect(mocks.days).toHaveBeenCalledTimes(2));
  view.rerender(ui(false));
  view.rerender(ui(true));
  expect(mocks.days).toHaveBeenCalledTimes(2);
  view.unmount();
  client.clear();
});

it('defers photo code until a selected index, forwards index zero and closes through the adapter', async () => {
  const change = vi.fn();
  const view = render(<PhotoLightbox photos={[]} index={null} onIndexChange={change} />);
  expect(mocks.photoModule).not.toHaveBeenCalled();
  expect(mocks.photoRender).not.toHaveBeenCalled();
  view.rerender(<PhotoLightbox photos={[]} index={0} onIndexChange={change} />);
  fireEvent.click(await screen.findByText('photo 0'));
  expect(change).toHaveBeenCalledWith(null);
  view.rerender(<PhotoLightbox photos={[]} index={null} onIndexChange={change} />);
  expect(screen.queryByText('photo 0')).not.toBeInTheDocument();
  view.rerender(<PhotoLightbox photos={[]} index={1} onIndexChange={change} />);
  expect(await screen.findByText('photo 1')).toBeInTheDocument();
  expect(mocks.photoModule).toHaveBeenCalledOnce();
});
