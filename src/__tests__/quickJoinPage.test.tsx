import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import QuickJoinPage from '@/app/(public)/join/[hashCode]/page';
import type { Trip } from '@/types';

const mocks = vi.hoisted(() => ({
  useCurrentUser: vi.fn(),
  useTrip: vi.fn(),
  useMembers: vi.fn(),
  push: vi.fn(),
  invalidateQueries: vi.fn(),
  joinTrip: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ hashCode: 'abc123' }),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@/hooks/queries', () => ({
  tripKeys: { all: (id: string) => ['trip', id] },
  useCurrentUser: mocks.useCurrentUser,
  useTrip: mocks.useTrip,
  useMembers: mocks.useMembers,
}));

vi.mock('@/actions', () => ({ joinTrip: mocks.joinTrip }));

const trip: Trip = {
  id: 'trip-1',
  name: 'Tokyo 2026',
  description: 'Summer trip',
  start_date: '2026-08-03T00:00:00.000Z',
  end_date: '2026-08-08T00:00:00.000Z',
  destination_location: null,
  hash_code: 'abc123',
  created_at: '2026-07-27T00:00:00.000Z',
  archived_at: null,
  budget: null,
  legacy_budget: null,
  currency_settings: null,
};

beforeEach(() => {
  mocks.useCurrentUser.mockReturnValue({ data: null, isPending: false });
  mocks.useTrip.mockReturnValue({
    data: trip,
    isPending: false,
    isError: false,
    error: null,
  });
  mocks.useMembers.mockReturnValue({ data: [], isPending: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuickJoinPage query states', () => {
  it('keeps showing a loading state while persisted queries are being restored', () => {
    mocks.useTrip.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
    });

    render(<QuickJoinPage />);

    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('quickJoin.loadError')).toBeNull();
  });

  it('shows the failure state only after the trip query errors', () => {
    mocks.useTrip.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('Failed to load (500)'),
    });

    render(<QuickJoinPage />);

    expect(screen.getByText('quickJoin.loadError')).toBeTruthy();
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });

  it('renders the trip while the non-critical members query is still pending', () => {
    mocks.useMembers.mockReturnValue({ data: [], isPending: true });

    render(<QuickJoinPage />);

    expect(screen.getByRole('heading', { name: 'Tokyo 2026' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'quickJoin.loginToJoin' })).toBeTruthy();
  });
});
