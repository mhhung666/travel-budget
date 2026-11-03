import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import TripCard from '@/components/trips/TripCard';
import { TripCardSummary } from '@/components/trips/TripCardLayout';
import { TripsPageSkeleton } from '@/components/skeletons';
import { cardDates, cardNumber } from '@/components/trips/tripCardFormat';
import type { TripWithMembers } from '@/types';
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const trip: TripWithMembers = {
  id: 'a',
  hash_code: 'abcdef',
  name: '完整旅行名稱 '.repeat(20),
  description: null,
  start_date: '2020-01-01',
  end_date: '2020-01-03',
  destination_location: null,
  created_at: '2020-01-01',
  archived_at: null,
  budget: { total: 999, categories: [] },
  legacy_budget: null,
  currency_settings: null,
  member_count: 3,
  my_spent: 27897.92,
  my_balance: 0,
  ledger: { baseCurrency: 'TWD', moneyScale: 2 },
};
it('zero balance omits a second number and list budget without changing primary navigation', () => {
  render(<TripCard trip={trip} onCopyCode={vi.fn()} onQuickExpense={vi.fn()} />);
  expect(screen.getAllByText(/TWD/)).toHaveLength(1);
  expect(screen.getByText('27,897.92 TWD')).toBeVisible();
  expect(screen.queryByText(/NT\$/)).toBeNull();
  expect(screen.queryByText('card.budget')).toBeNull();
  expect(screen.getByText('card.noBalance')).toBeVisible();
  const main = screen.getByRole('link', { name: /card.openTrip/ });
  expect(main).toHaveAccessibleName(/27,897.92 TWD/);
  expect(within(main).queryByRole('button')).toBeNull();
  expect(screen.getByRole('button', { name: 'card.quickExpense' })).toHaveClass('min-h-12');
});
it.each([0.01, -0.06])(
  'small nonzero balance %s keeps its amount, direction and settlement shortcut',
  (balance) => {
    render(<TripCard trip={{ ...trip, my_balance: balance }} onCopyCode={vi.fn()} />);
    expect(screen.getByText(balance > 0 ? 'card.receive' : 'card.pay')).toBeVisible();
    expect(screen.getByText(`${Math.abs(balance)} TWD`)).toBeVisible();
    expect(screen.getByRole('link', { name: 'card.viewSettlement' })).toHaveAttribute(
      'href',
      '/trips/abcdef/settlement'
    );
  }
);
it.each(['2020-01-03', '2099-01-03', null])(
  'archived cards keep truthful phase (%s), open hint and no shortcuts',
  (end) => {
    render(
      <TripCard
        trip={{
          ...trip,
          start_date: end ? `${end.slice(0, 4)}-01-01` : null,
          end_date: end,
          archived_at: '2026-01-01',
        }}
        onCopyCode={vi.fn()}
        onQuickExpense={vi.fn()}
      />
    );
    const status = screen.getByText(/tabArchived/);
    expect(status.tagName).toBe('SPAN');
    if (end === '2020-01-03') expect(status.textContent).toBe('tabArchived');
    else expect(status.textContent).toContain('card.phase.');
    expect(screen.queryByText('card.quickExpense')).toBeNull();
    expect(screen.getByText('card.openTrip')).toBeVisible();
  }
);
it.each(['zh', 'zh-CN', 'en', 'jp'])(
  'card dates and money keep exact date-only endpoints and fractional amounts in %s',
  (locale) => {
    expect(cardNumber(999999999999.01, locale)).toBe('999,999,999,999.01');
    expect(cardNumber(0.01, locale)).toBe('0.01');
    expect(cardDates('2027-01-12', '2027-01-12', locale)?.match(/2027/g)).toHaveLength(1);
    expect(cardDates('2027-01-12', '2027-01-18', locale)?.match(/2027/g)).toHaveLength(1);
    const cross = cardDates('2026-12-31', '2027-01-01', locale);
    expect(cross).toContain('2026');
    expect(cross).toContain('2027');
    expect(cardDates(null, '2027-01-01', locale)).toBeNull();
  }
);
it('the observer removes the vertical divider when intrinsic columns wrap, then disconnects', () => {
  let measure!: () => void;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(fn: () => void) {
        measure = fn;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  const { container, unmount } = render(<TripCardSummary left="share" right="balance" />);
  const summary = container.querySelector('dl')!;
  const [first, second] = Array.from(summary.children);
  Object.defineProperty(first, 'offsetTop', { value: 0 });
  Object.defineProperty(second, 'offsetTop', { value: 60, configurable: true });
  act(() => measure());
  expect(summary).toHaveAttribute('data-stacked', 'true');
  Object.defineProperty(second, 'offsetTop', { value: 0 });
  act(() => measure());
  expect(summary).toHaveAttribute('data-stacked', 'false');
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
it('skeletons use the card slots, retain page chrome, hide unknown counts and have no controls or animation', () => {
  const { container } = render(<TripsPageSkeleton archived />);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveAccessibleName('card.loading');
  expect(container.querySelector('h1')).toHaveTextContent('title');
  expect(container.querySelectorAll('[data-trip-card-skeleton]')).toHaveLength(6);
  expect(container.querySelectorAll('[data-trip-summary]')).toHaveLength(6);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByRole('link')).toBeNull();
  expect(container.textContent).not.toContain('(0)');
  expect(container.querySelectorAll('.animate-pulse:not(.animate-none)')).toHaveLength(0);
  for (const card of container.querySelectorAll('[data-trip-card-skeleton]')) {
    expect(card).toHaveAttribute('aria-hidden', 'true');
    expect(card).toHaveClass('rounded-[14px]');
    expect(card.querySelectorAll('.h-12.w-24')).toHaveLength(0);
  }
});
