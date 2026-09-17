import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { TripWithMembers } from '@/types';

const mocks = vi.hoisted(() => ({ useTrips: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/hooks/queries', () => ({ useTrips: mocks.useTrips, tripKeys: {} }));
vi.mock('@/lib/productEvents', () => ({ trackProductEvent: vi.fn() }));
vi.mock('@/components/common', () => ({
  ResponsiveFormSheet: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));
vi.mock('@/hooks/useTripSpace', () => ({
  useTripSpace: (tripId: string) => ({
    trip: { name: `trip:${tripId}`, currency_settings: null },
    isLoading: false,
    members: [{ id: 'me' }],
    currentUser: { id: 'me' },
    isMember: true,
    isMembershipLoading: false,
    formQuery: {},
    formReady: true,
    itineraryDays: [],
    existingTags: [],
    handleAddExpense: vi.fn(),
  }),
}));
vi.mock('@/components/trips/DeferredDialogs', () => ({
  CreateTripDialog: () => null,
  ExpenseFormSheet: ({ tripName, tripId }: { tripName: string; tripId: string }) => (
    <p>
      expense-form {tripId} {tripName}
    </p>
  ),
}));
import { GlobalQuickAddFlow } from '@/components/layout/GlobalQuickAddFlow';

const trip = (id: string): TripWithMembers =>
  ({
    id,
    hash_code: `hash-${id}`,
    name: id,
    start_date: null,
    end_date: null,
    created_at: '2026-01-01',
    archived_at: null,
  }) as TripWithMembers;

afterEach(cleanup);

it('opens the form for the trip being viewed as the first screen', () => {
  mocks.useTrips.mockReturnValue({ data: [trip('penghu'), trip('tokyo')], isLoading: false });
  render(
    <GlobalQuickAddFlow
      open
      preferredTripId="tokyo"
      currentTripId="hash-penghu"
      onClose={vi.fn()}
    />
  );
  expect(screen.getByText('expense-form hash-penghu trip:hash-penghu')).toBeInTheDocument();
  expect(screen.queryByText('pickTrip')).not.toBeInTheDocument();
});

it('still asks which trip outside a trip', () => {
  mocks.useTrips.mockReturnValue({ data: [trip('penghu'), trip('tokyo')], isLoading: false });
  render(<GlobalQuickAddFlow open preferredTripId={null} onClose={vi.fn()} />);
  expect(screen.getByText('pickTrip')).toBeInTheDocument();
  expect(screen.queryByText(/expense-form/)).not.toBeInTheDocument();
});
