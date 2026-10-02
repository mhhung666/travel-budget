import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TripList from '@/components/trips/TripList';
import type { TripWithMembers } from '@/types';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const makeTrip = (id: string, overrides: Partial<TripWithMembers> = {}): TripWithMembers => ({
  id,
  hash_code: `code${id}`,
  name: `Trip ${id}`,
  description: null,
  start_date: null,
  end_date: null,
  destination_location: null,
  created_at: '2026-01-01T00:00:00.000Z',
  archived_at: null,
  budget: null,
  legacy_budget: null,
  currency_settings: null,
  member_count: 2,
  my_spent: 0,
  my_balance: 0,
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-10T12:00:00'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('pins ongoing then soonest upcoming trips and shows each card status', async () => {
  const onQuickExpense = vi.fn();
  // getTrips 的既有排序：出發日新到舊
  const trips = [
    makeTrip('far', { start_date: '2026-12-01', end_date: '2026-12-05' }),
    makeTrip('soon', {
      start_date: '2026-07-20',
      end_date: '2026-07-25',
      my_spent: 1200,
      budget: { total: 30000, categories: [] },
    }),
    makeTrip('now', { start_date: '2026-07-08', end_date: '2026-07-12', my_spent: 500 }),
    makeTrip('owed', {
      start_date: '2026-05-01',
      end_date: '2026-05-05',
      my_spent: 800,
      my_balance: -300,
    }),
  ];
  render(<TripList trips={trips} onCopyCode={vi.fn()} onQuickExpense={onQuickExpense} />);

  const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
  expect(headings).toEqual([
    'currentGroup',
    'Trip now',
    'Trip soon',
    'Trip far',
    '2026',
    'Trip owed',
  ]);

  expect(screen.getByText('ongoingBadge')).toBeInTheDocument();
  expect(screen.getAllByText('card.upcoming')).toHaveLength(2);
  expect(screen.getByText('card.pendingSettlement')).toBeInTheDocument();
  expect(screen.getByText('card.mySpentOfBudget')).toBeInTheDocument();
  expect(screen.getByText('card.youPay')).toBeInTheDocument();

  // 待結算的卡片把「記一筆」換成「查看結算」
  const owedCard = screen.getByText('Trip owed').closest('[class*="cursor-pointer"]')!;
  expect(
    within(owedCard as HTMLElement).getByRole('link', { name: /card.viewSettlement/ })
  ).toHaveAttribute('href', '/trips/codeowed/settlement');
  expect(
    within(owedCard as HTMLElement).queryByRole('button', { name: /card.quickExpense/ })
  ).toBeNull();

  const nowCard = screen.getByText('Trip now').closest('[class*="cursor-pointer"]') as HTMLElement;
  await userEvent.setup().click(within(nowCard).getByRole('button', { name: /card.quickExpense/ }));
  expect(onQuickExpense).toHaveBeenCalledWith(trips[2]);
  expect(within(nowCard).getByRole('link', { name: /card.viewItinerary/ })).toHaveAttribute(
    'href',
    '/trips/codenow'
  );
});
