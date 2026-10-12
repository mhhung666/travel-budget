import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import TripCard from '@/components/trips/TripCard';
import type { TripWithMembers } from '@/types';
import zh from '@/i18n/messages/zh.json';
import cn from '@/i18n/messages/zh-CN.json';
import en from '@/i18n/messages/en.json';
import jp from '@/i18n/messages/jp.json';
import { expectNoSeriousAxeViolations } from '@/test/axe';
vi.unmock('next-intl');
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));
afterEach(cleanup);
const trip: TripWithMembers = {
  id: '65a000000000000000000001',
  hash_code: 'abcdef',
  name: '同名長旅行 '.repeat(30).trim(),
  description: 'private description',
  start_date: null,
  end_date: '2020-01-03',
  destination_location: null,
  created_at: '2020-01-01T00:00:00.000Z',
  archived_at: null,
  budget: null,
  legacy_budget: null,
  currency_settings: null,
  member_count: 4,
  my_spent: 99999999.01,
  my_balance: -0.01,
  ledger: { baseCurrency: 'JPY', moneyScale: 2 },
};
it.each([
  ['zh', zh],
  ['zh-CN', cn],
  ['en', en],
  ['jp', jp],
] as const)(
  'shows complete date, phase and personal accounting in %s, with keyboard-safe siblings',
  async (locale, messages) => {
    const { container } = render(
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Taipei">
        <TripCard trip={trip} onCopyCode={vi.fn()} onQuickExpense={vi.fn()} />
      </NextIntlClientProvider>
    );
    const main = screen.getByRole('link', { name: new RegExp(messages.trips.card.openTrip) });
    expect(within(main).getByRole('heading', { name: trip.name })).toBeVisible();
    expect(within(main).getByText(messages.trips.card.phase.past)).toBeVisible();
    expect(within(main).getByText(messages.trips.card.myShare)).toBeVisible();
    expect(within(main).getByText(messages.trips.card.pay)).toBeVisible();
    expect(within(main).getByText(new RegExp(messages.trips.card.notSet))).toBeVisible();
    expect(within(main).getAllByText(/JPY ·/)).toHaveLength(2);
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain(trip.name);
    expect(screen.getByRole('link', { name: messages.trips.card.viewSettlement })).toHaveAttribute(
      'href',
      '/trips/abcdef/settlement'
    );
    expect(within(main).queryByRole('button')).toBeNull();
    expect(screen.queryByText('private description')).toBeNull();
    await expectNoSeriousAxeViolations(container);
  }
);
