import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useTrips: vi.fn(),
  refetch: vi.fn(),
  track: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/hooks/queries', () => ({ useTrips: mocks.useTrips, tripKeys: {} }));
vi.mock('@/hooks/useTripSpace', () => ({ useTripSpace: vi.fn() }));
vi.mock('@/lib/productEvents', () => ({ trackProductEvent: mocks.track }));
vi.mock('@/components/common', () => ({
  ResponsiveFormSheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/trips/CreateTripDialog', () => ({ default: () => <p>create-trip</p> }));
vi.mock('@/components/trips/detail/expense-form', () => ({ ExpenseFormSheet: () => null }));
import { GlobalQuickAddFlow } from '@/components/layout/GlobalQuickAddFlow';
import { QueryFeedback } from '@/components/common/QueryFeedback';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useTrips.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    isFetching: false,
    refetch: mocks.refetch,
  });
});
afterEach(cleanup);

it('shows retry instead of trip creation and does not emit a creation event on error', () => {
  render(<GlobalQuickAddFlow open preferredTripId={null} onClose={vi.fn()} />);
  expect(screen.getByText('queryLoadFailed')).toBeInTheDocument();
  expect(screen.queryByText('create-trip')).not.toBeInTheDocument();
  expect(mocks.track).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'retry' }));
  expect(mocks.refetch).toHaveBeenCalledOnce();
});

it('disables trips while closed', () => {
  const view = render(<GlobalQuickAddFlow open={false} preferredTripId={null} onClose={vi.fn()} />);
  expect(mocks.useTrips).toHaveBeenCalledWith(false);
  expect(view.container).toBeEmptyDOMElement();
});

it('shows a network waiting state for a paused cold query', () => {
  render(<QueryFeedback hasData={false} isError isFetching={false} isPaused onRetry={vi.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('queryPaused');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it.each([true, false])(
  'explains offline reads without a misleading failure (cached=%s)',
  (hasData) => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    render(<QueryFeedback hasData={hasData} isError isFetching={false} onRetry={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      hasData ? 'queryOfflineCached' : 'queryOfflineMissing'
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    vi.restoreAllMocks();
  }
);
