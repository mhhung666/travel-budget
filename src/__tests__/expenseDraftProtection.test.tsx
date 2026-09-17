import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpenseFormSheet from '@/components/trips/detail/expense-form/ExpenseFormSheet';
import {
  EXPENSE_DRAFT_TTL_MS,
  expenseDraftKey,
  loadExpenseDraft,
  saveExpenseDraft,
} from '@/lib/expenseDraftStorage';
import type { Expense, Member } from '@/types';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/components/trips/detail/ReceiptAttachments', () => ({
  ReceiptUploader: () => <div data-testid="receipt-uploader" />,
}));

const members = [
  { id: 'me', username: 'amy', display_name: 'Amy', joined_at: '2026-01-01', role: 'admin' },
  { id: 'ben', username: 'ben', display_name: 'Ben', joined_at: '2026-01-01', role: 'member' },
] as Member[];

const TRIP = 'trip-1';

const expense = {
  id: 'expense-1',
  trip_id: TRIP,
  payer_id: 'me',
  original_amount: 100,
  currency: 'TWD',
  exchange_rate: 1,
  description: 'Lunch',
  category: 'food',
  date: '2026-09-01',
  splits: [
    { user_id: 'me', share_amount: 50 },
    { user_id: 'ben', share_amount: 50 },
  ],
  attachments: [],
  tags: [],
  itinerary_day_ids: [],
} as unknown as Expense;

function renderForm(props: Partial<Parameters<typeof ExpenseFormSheet>[0]> = {}) {
  // Radix Checkbox（分帳成員列）量測尺寸需要 ResizeObserver，jsdom 沒有。
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ json: async () => ({ success: true, rates: {} }) })
  );
  return render(
    <ExpenseFormSheet
      mode="add"
      tripId={TRIP}
      open
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      members={members}
      currentUser={{ id: 'me' }}
      {...props}
    />
  );
}

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('expense draft storage', () => {
  it('drops drafts that are stale, corrupted or from another version', () => {
    const snapshot = loadStubSnapshot();
    saveExpenseDraft(TRIP, snapshot, Date.now() - EXPENSE_DRAFT_TTL_MS - 1);
    expect(loadExpenseDraft(TRIP)).toBeNull();
    expect(localStorage.getItem(expenseDraftKey(TRIP))).toBeNull();

    localStorage.setItem(expenseDraftKey(TRIP), 'not json');
    expect(loadExpenseDraft(TRIP)).toBeNull();

    localStorage.setItem(
      expenseDraftKey(TRIP),
      JSON.stringify({ version: 0, savedAt: Date.now(), snapshot })
    );
    expect(loadExpenseDraft(TRIP)).toBeNull();
  });

  it("keeps each trip's draft separate", () => {
    saveExpenseDraft(TRIP, loadStubSnapshot('Trip one'));
    saveExpenseDraft('trip-2', loadStubSnapshot('Trip two'));
    expect(loadExpenseDraft(TRIP)?.form.description).toBe('Trip one');
    expect(loadExpenseDraft('trip-2')?.form.description).toBe('Trip two');
  });
});

function loadStubSnapshot(description = 'Draft') {
  return {
    form: {
      payer_id: 'me',
      original_amount: '100',
      currency: 'TWD',
      exchange_rate: '1.0',
      description,
      category: 'food',
      date: '2026-09-01',
    },
    splitMode: 'equal' as const,
    splitState: { me: { selected: true, value: '' }, ben: { selected: true, value: '' } },
    itineraryDayIds: [],
    tags: [],
    attachments: [],
  };
}

it('keeps what was typed when the add form is closed, and brings it back', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const view = renderForm({ onClose });

  await user.type(screen.getByLabelText('amount'), '100');
  await user.type(screen.getByLabelText('form.description'), 'Night market');
  await user.click(screen.getByRole('button', { name: 'cancel' }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(loadExpenseDraft(TRIP)?.form).toMatchObject({
    original_amount: '100',
    description: 'Night market',
  });

  view.unmount();
  renderForm();
  expect(screen.getByLabelText('amount')).toHaveValue('100');
  expect(screen.getByLabelText('form.description')).toHaveValue('Night market');
  expect(screen.getByText('form.draft.restored')).toBeInTheDocument();
});

it('closes without leaving a draft when nothing was typed', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  renderForm({ onClose });

  await user.click(screen.getByRole('button', { name: 'cancel' }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(loadExpenseDraft(TRIP)).toBeNull();
  expect(screen.queryByText('form.draft.restored')).not.toBeInTheDocument();
});

it('lets the user discard a restored draft back to an empty form', async () => {
  const user = userEvent.setup();
  saveExpenseDraft(TRIP, loadStubSnapshot('Night market'));
  renderForm();

  await user.click(screen.getByRole('button', { name: 'form.draft.discard' }));

  expect(screen.getByLabelText('form.description')).toHaveValue('');
  expect(screen.getByLabelText('amount')).toHaveValue('');
  expect(loadExpenseDraft(TRIP)).toBeNull();
  expect(screen.queryByText('form.draft.restored')).not.toBeInTheDocument();
});

it('asks before dropping edits to an existing expense, and never stores them', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  renderForm({ mode: 'edit', expense, onClose });

  await user.type(screen.getByLabelText('form.description'), ' with Ben');
  await user.click(screen.getByRole('button', { name: 'cancel' }));

  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByText('form.draft.unsavedTitle')).toBeInTheDocument();
  expect(loadExpenseDraft(TRIP)).toBeNull();

  await user.click(screen.getByRole('button', { name: 'form.draft.keepEditing' }));
  expect(onClose).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: 'cancel' }));
  await user.click(screen.getByRole('button', { name: 'form.draft.discardChanges' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(loadExpenseDraft(TRIP)).toBeNull();
});

it('closes an untouched edit form without asking', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  renderForm({ mode: 'edit', expense, onClose });

  await user.click(screen.getByRole('button', { name: 'cancel' }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('form.draft.unsavedTitle')).not.toBeInTheDocument();
});
