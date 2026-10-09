import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '@/i18n/messages/en.json';
import { ExpenseDraftRecovery } from '@/components/expenses/ExpenseDraftRecovery';
import type { ExpenseOutbox } from '@/lib/expenseOutbox';

const h = vi.hoisted(() => ({ entries: {} as ExpenseOutbox, save: vi.fn() }));
vi.mock('next-intl', async (original) => {
  const actual = await original<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace: 'offline') =>
      actual.createTranslator({ locale: 'en', messages: en, namespace }),
  };
});
vi.mock('@/hooks/useExpenseOutbox', () => ({ useExpenseOutbox: () => ({ data: h.entries }) }));
vi.mock('@/lib/expenseOutbox', async (original) => ({
  ...(await original<typeof import('@/lib/expenseOutbox')>()),
  saveExpenseOutbox: (...args: unknown[]) => h.save(...args),
}));
vi.mock('@/hooks/queries/useExpenseMutations', () => ({ useExpenseMutations: vi.fn() }));
vi.mock('@/hooks/queries/useTripQueries', () => ({ useMembers: vi.fn(), useCurrentUser: vi.fn() }));
vi.mock('@/components/trips/DeferredDialogs', () => ({ ExpenseFormSheet: () => null }));
vi.mock('@/components/common/ResponsiveFormSheet', () => ({
  ResponsiveFormSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
}));

const input = (description: string, client_request_id: string) => ({
  payer_id: 'user',
  description,
  original_amount: 100,
  currency: 'TWD',
  exchange_rate: 1,
  category: 'food' as const,
  date: '2026-09-07',
  splits: [{ user_id: 'user', share_amount: 100 }],
  client_request_id,
});
const legacyId = '3f4c1d2e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const currentId = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';

beforeEach(() => {
  h.save.mockReset().mockResolvedValue(undefined);
  h.entries = {
    // Saved by an older bundle: no contract version.
    [legacyId]: {
      vars: { tripId: 'trip', input: input('Old dinner', legacyId) },
      status: 'pending',
      createdAt: 1,
    },
    [currentId]: {
      vars: {
        tripId: 'trip',
        contractVersion: 2,
        input: { ...input('New dinner', currentId), base_currency: 'TWD' },
      },
      status: 'pending',
      createdAt: 2,
    },
  };
});
afterEach(cleanup);

it('lists a request queued before v2 as unsendable and lets the user discard it', async () => {
  const user = userEvent.setup();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ExpenseDraftRecovery />
    </QueryClientProvider>
  );
  await user.click(screen.getByRole('button', { name: en.offline.reviewDrafts }));
  const [legacy, current] = within(screen.getByRole('dialog')).getAllByRole('listitem');

  expect(within(legacy).getByText(en.offline.legacyDraft)).toBeInTheDocument();
  expect(within(legacy).queryByRole('button', { name: en.offline.editDraft })).toBeNull();
  // A v2 request still syncing cannot be discarded; only the legacy one can.
  expect(within(current).getByText(en.offline.pending)).toBeInTheDocument();
  expect(within(current).getByRole('button', { name: en.offline.discardDraft })).toBeDisabled();

  await user.click(within(legacy).getByRole('button', { name: en.offline.discardDraft }));
  expect(h.save).toHaveBeenCalledExactlyOnceWith(
    expect.any(QueryClient),
    h.entries[legacyId].vars,
    undefined,
    'done'
  );
});
