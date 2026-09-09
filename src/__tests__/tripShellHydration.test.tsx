import { act, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { TripSpaceShell } from '@/components/trips/space/TripSpaceShell';
import { useTripSpace } from '@/hooks/useTripSpace';

vi.mock('@/hooks/useTripSpace', () => ({ useTripSpace: vi.fn() }));
vi.mock('@/components/notifications/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
  usePathname: () => '/trips/t1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

it.each([false, true])(
  'hydrates cached shell feedback and membership without mismatch (member=%s)',
  async (member) => {
    const noop = vi.fn();
    const dialog = { open: false, data: null, openDialog: noop, closeDialog: noop };
    const cold = {
      trip: undefined,
      isLoading: true,
      isMember: false,
      members: [],
      currentUser: null,
      formQuery: { data: undefined, refetch: noop },
      formReady: false,
      shellQuery: { data: undefined, isFetching: false, refetch: noop },
      itineraryDays: [],
      existingTags: [],
      budgetProgress: { total: null, totalSpent: 0 },
      addExpenseDialog: dialog,
      budgetDialog: dialog,
      handleAddExpense: noop,
      handleSetBudget: noop,
    } as unknown as ReturnType<typeof useTripSpace>;
    vi.mocked(useTripSpace).mockReturnValue(cold);
    const app = (
      <TripSpaceShell tripId="t1">
        <p>route content</p>
      </TripSpaceShell>
    );
    const container = document.createElement('div');
    document.body.append(container);
    container.innerHTML = renderToString(app);
    vi.mocked(useTripSpace).mockReturnValue({
      ...cold,
      trip: { name: 'Cached trip' },
      isLoading: false,
      isMember: member,
      shellQuery: { data: {}, isFetching: false, refetch: noop },
    } as unknown as ReturnType<typeof useTripSpace>);
    const errors = vi.fn();
    let root!: Root;
    try {
      await act(async () => {
        root = hydrateRoot(container, app, { onRecoverableError: errors });
      });
      expect(screen.getByRole('heading', { name: 'Cached trip' })).toBeInTheDocument();
      expect(!!screen.queryByText(/mySpent/)).toBe(member);
      expect(screen.queryByText('loading')).not.toBeInTheDocument();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  }
);
