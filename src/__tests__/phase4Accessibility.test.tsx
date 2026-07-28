import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmptyTripsState from '@/components/trips/EmptyTripsState';
import FirstStepsCard from '@/components/trips/detail/FirstStepsCard';
import TripHeader from '@/components/trips/detail/TripHeader';
import { BottomTabBar } from '@/components/layout/BottomTabBar';
import { expectNoSeriousAxeViolations } from '@/test/axe';
import type { Trip } from '@/types';

const { trackNavigation } = vi.hoisted(() => ({
  trackNavigation: vi.fn(),
}));

vi.mock('@/lib/navigationEvents', () => ({
  trackNavigation,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/trips',
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const trip: Trip = {
  id: 'trip-1',
  name: 'Accessibility trip',
  description: 'Trip details',
  start_date: '2026-07-01',
  end_date: '2026-07-05',
  destination_location: null,
  hash_code: 'abc123',
  created_at: '2026-06-01T00:00:00.000Z',
  archived_at: null,
  budget: null,
  currency_settings: null,
};

describe('Phase 4 critical interaction accessibility', () => {
  it('keeps the empty-trip actions operable and axe-clean', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    const { container } = render(<EmptyTripsState onCreate={onCreate} onJoin={onJoin} />);

    await expectNoSeriousAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'createTrip' }));
    await user.click(screen.getByRole('button', { name: 'joinTrip' }));

    expect(onCreate).toHaveBeenCalledOnce();
    expect(onJoin).toHaveBeenCalledOnce();
  });

  it('exposes both onboarding actions and dismiss through named controls', async () => {
    const user = userEvent.setup();
    const onAddExpense = vi.fn();
    const onCopyInvite = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(
      <FirstStepsCard
        hasExpense={false}
        hasInvited={false}
        onAddExpense={onAddExpense}
        onCopyInvite={onCopyInvite}
        onDismiss={onDismiss}
      />
    );

    await expectNoSeriousAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'addExpense' }));
    await user.click(screen.getByRole('button', { name: 'copyInvite' }));
    await user.click(screen.getByRole('button', { name: 'dismiss' }));

    expect(onAddExpense).toHaveBeenCalledOnce();
    expect(onCopyInvite).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('opens compact trip details with keyboard-compatible controls', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const { container } = render(<TripHeader trip={trip} isCurrentUserAdmin onEdit={onEdit} />);

    expect(screen.queryByText('Trip details')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'moreDetails' }));
    expect(screen.queryByText('Trip details')).not.toBeNull();
    await expectNoSeriousAxeViolations(container);
  });

  it('keeps global mobile navigation named and fires quick add once', async () => {
    const user = userEvent.setup();
    const onQuickAdd = vi.fn();
    const { container } = render(<BottomTabBar onQuickAdd={onQuickAdd} />);

    await expectNoSeriousAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'quickAdd' }));

    expect(onQuickAdd).toHaveBeenCalledOnce();
    expect(trackNavigation).toHaveBeenCalledWith('quick_add', 'mobile_tab');
  });
});
