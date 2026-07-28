import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JoinTripDialog from '@/components/trips/JoinTripDialog';
import { expectNoSeriousAxeViolations } from '@/test/axe';
import type { Trip } from '@/types';

const { joinTrip } = vi.hoisted(() => ({
  joinTrip: vi.fn(),
}));

vi.mock('@/actions', () => ({ joinTrip }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => true,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const joinedTrip: Trip = {
  id: 'trip-1',
  name: 'Joined trip',
  description: null,
  start_date: null,
  end_date: null,
  destination_location: null,
  hash_code: 'abc123',
  created_at: '2026-07-27T00:00:00.000Z',
  archived_at: null,
  budget: null,
  currency_settings: null,
};

describe('Phase 4 critical flow interactions', () => {
  it('accepts a complete invitation URL and returns the joined trip', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    joinTrip.mockResolvedValue({ success: true, data: joinedTrip });

    render(<JoinTripDialog open onClose={vi.fn()} onSuccess={onSuccess} />);

    await user.type(
      screen.getByRole('textbox', { name: 'join.tripId' }),
      'https://budget.example/join/ABC123'
    );
    await user.click(screen.getByRole('button', { name: 'join.joinButton' }));

    expect(joinTrip).toHaveBeenCalledWith('abc123');
    expect(onSuccess).toHaveBeenCalledWith(joinedTrip);
  });

  it('keeps the join dialog free of serious/critical axe violations', async () => {
    render(<JoinTripDialog open onClose={vi.fn()} onSuccess={vi.fn()} />);

    await expectNoSeriousAxeViolations(document.body);
  });
});
