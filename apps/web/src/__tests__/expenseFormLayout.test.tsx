import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpenseFormSheet from '@/components/trips/detail/expense-form/ExpenseFormSheet';
import type { Member } from '@/types';
import { buildOptimisticExpense } from '@/lib/optimisticExpense';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/components/trips/detail/ReceiptAttachments', () => ({
  ReceiptUploader: () => <div data-testid="receipt-uploader" />,
}));

const members = [
  { id: 'me', username: 'amy', display_name: 'Amy', joined_at: '2026-01-01', role: 'admin' },
  { id: 'ben', username: 'ben', display_name: 'Ben', joined_at: '2026-01-01', role: 'member' },
] as Member[];

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
    vi.fn().mockImplementation(async () =>
      Response.json({
        success: true,
        rates: { TWD: 1, USD: 1 / 0.03123, JPY: 0.2156789012345 },
        dates: { USD: '2026-10-21', JPY: '2026-10-21' },
        provider: 'Frankfurter',
      })
    )
  );
  return render(
    <ExpenseFormSheet
      mode="add"
      tripId="trip"
      open
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      members={members}
      currentUser={{ id: 'me' }}
      {...props}
    />
  );
}

it('shows payer, date and split summary without opening more settings', async () => {
  const user = userEvent.setup();
  renderForm({ tripName: 'Chengdu' });

  expect(screen.getByLabelText('form.payer')).toBeInTheDocument();
  expect(screen.getByLabelText('form.date')).toBeInTheDocument();
  expect(screen.getAllByText('form.recordingTo').length).toBeGreaterThan(0);
  expect(screen.queryByText('form.tags')).not.toBeInTheDocument();

  const splitToggle = screen.getByRole('button', { name: /form\.splitWith/ });
  expect(splitToggle).toHaveAttribute('aria-expanded', 'false');
  await user.click(splitToggle);
  expect(splitToggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('split.equal')).toBeInTheDocument();
  expect(screen.queryByText('form.tags')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /form\.moreSettings/ }));
  expect(screen.getByText('form.tags')).toBeInTheDocument();
});

it('offers trip switching only when the caller provides it', async () => {
  const user = userEvent.setup();
  const onSwitchTrip = vi.fn();
  const view = renderForm({ tripName: 'Chengdu' });
  expect(screen.queryByRole('button', { name: /form\.switchTrip/ })).not.toBeInTheDocument();

  view.unmount();
  renderForm({ tripName: 'Chengdu', onSwitchTrip });
  await user.click(screen.getByRole('button', { name: /form\.switchTrip/ }));
  expect(onSwitchTrip).toHaveBeenCalledTimes(1);
});

it('explains that the draft stays with this trip once the form has content', async () => {
  const user = userEvent.setup();
  renderForm({ tripId: `trip-${Math.random()}`, tripName: 'Penghu', onSwitchTrip: vi.fn() });
  expect(screen.queryByText('form.switchTripDraftHint')).not.toBeInTheDocument();

  await user.type(screen.getByLabelText('amount'), '120');
  expect(screen.getByText('form.switchTripDraftHint')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /form\.switchTrip/ })).toHaveAttribute(
    'aria-describedby',
    'switch-trip-draft-hint'
  );
});

const preciseRates = [
  // Equal splitting allocates original cents first (50.01 / 50), then converts.
  { base: 'TWD', currency: 'USD', rate: String(1 / 0.03123), shares: [1601.35, 1601.02] },
  { base: 'USD', currency: 'JPY', rate: '0.123456789', shares: [6.18, 6.17] },
  { base: 'JPY', currency: 'USD', rate: '1.23456789e-7', shares: [0, 0] },
];

it.each(preciseRates.flatMap((c) => [true, false].map((expanded) => ({ ...c, expanded }))))(
  'submits $base / $currency at full rate $rate with advanced fields expanded=$expanded',
  async ({ base, currency, rate, shares, expanded }) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({
      baseCurrency: base,
      currencySettings: {
        default_currency: currency,
        currencies: [{ code: currency, rate: Number(rate) }],
      },
      onSubmit,
    });
    await user.type(screen.getByLabelText('amount'), '100.01');
    await user.type(screen.getByLabelText('form.description'), 'Precise quote');
    if (expanded) {
      await user.click(screen.getByRole('button', { name: /form\.moreSettings/ }));
      const input = screen.getByLabelText('form.exchangeRate') as HTMLInputElement;
      expect(input.value).toBe(rate);
      expect(input.validity.stepMismatch).toBe(false);
      expect(input.checkValidity()).toBe(true);
    }
    // Click the real external submit button: fireEvent.submit would skip native validation.
    await user.click(screen.getByRole('button', { name: 'add' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        base_currency: base,
        currency,
        exchange_rate: rate,
        original_amount: '100.01',
        splits: shares.map((share_amount, i) => ({ user_id: members[i].id, share_amount })),
      })
    );
  }
);

it('prefills and refreshes a non-TWD cross-rate without truncating the submitted quote', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  renderForm({
    baseCurrency: 'USD',
    currencySettings: { default_currency: 'JPY', currencies: [{ code: 'JPY', rate: null }] },
    onSubmit,
  });
  await user.type(screen.getByLabelText('amount'), '100.01');
  await user.type(screen.getByLabelText('form.description'), 'Cross-rate');
  await user.click(screen.getByRole('button', { name: /form\.moreSettings/ }));
  const input = screen.getByLabelText('form.exchangeRate') as HTMLInputElement;
  const rate = 0.2156789012345 / (1 / 0.03123);
  await waitFor(() => expect(input.value).toBe(String(rate)));
  fireEvent.change(input, { target: { value: '0.123456789' } });
  await user.click(screen.getByRole('button', { name: 'form.refreshRate' }));
  await waitFor(() => expect(input.value).toBe(String(rate)));
  await user.click(screen.getByRole('button', { name: 'add' }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      exchange_rate: String(rate),
      base_currency: 'USD',
      splits: [
        { user_id: 'me', share_amount: 0.34 },
        { user_id: 'ben', share_amount: 0.33 },
      ],
    })
  );
});

it('restores a manually entered precise rate from the scoped draft and submits it unchanged', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  const props = {
    baseCurrency: 'USD',
    currencySettings: { default_currency: 'JPY', currencies: [{ code: 'JPY', rate: 0.2 }] },
    onSubmit,
  };
  const view = renderForm(props);
  await user.type(screen.getByLabelText('amount'), '100.01');
  await user.type(screen.getByLabelText('form.description'), 'Restored quote');
  await user.click(screen.getByRole('button', { name: /form\.moreSettings/ }));
  fireEvent.change(screen.getByLabelText('form.exchangeRate'), {
    target: { value: '0.123456789' },
  });
  await user.click(screen.getByRole('button', { name: 'cancel' }));
  view.unmount();
  renderForm(props);
  expect(screen.getByText('form.draft.restored')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /form\.moreSettings/ }));
  expect(screen.getByLabelText('form.exchangeRate')).toHaveValue(0.123456789);
  await user.click(screen.getByRole('button', { name: 'add' }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      exchange_rate: '0.123456789',
      splits: [
        { user_id: 'me', share_amount: 6.18 },
        { user_id: 'ben', share_amount: 6.17 },
      ],
    })
  );
});

it.each([true, false])(
  'keeps historical money on a description-only edit, expanded=%s',
  async (expanded) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const expense = buildOptimisticExpense(
      {
        base_currency: 'USD',
        payer_id: 'me',
        original_amount: 100.01,
        currency: 'JPY',
        exchange_rate: 0.123456789,
        description: 'Old description',
        category: 'food',
        date: '2026-10-21',
        splits: [
          { user_id: 'me', share_amount: 8 },
          { user_id: 'ben', share_amount: 4.35 },
        ],
        tags: ['keep'],
      },
      { tripId: 'trip', id: 'expense', members, createdAt: '2026-10-21' }
    );
    renderForm({ mode: 'edit', baseCurrency: 'USD', expense, onSubmit });
    if (!expanded) await user.click(screen.getByRole('button', { name: /form\.moreSettings/ }));
    await user.type(screen.getByLabelText('form.description'), ' updated');
    await user.click(screen.getByRole('button', { name: 'save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        preserve_money: true,
        exchange_rate: '0.123456789',
        original_amount: '100.01',
        splits: [
          { user_id: 'me', share_amount: 8 },
          { user_id: 'ben', share_amount: 4.35 },
        ],
        tags: ['keep'],
      })
    );
  }
);

it.each(['0', '-0.123456789', '', 'NaN', 'Infinity', '1e309'])(
  'does not submit invalid foreign rate %j',
  async (rate) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({
      currencySettings: { default_currency: 'USD', currencies: [{ code: 'USD', rate: 32 }] },
      onSubmit,
    });
    await user.type(screen.getByLabelText('amount'), '100');
    await user.type(screen.getByLabelText('form.description'), 'Invalid quote');
    await user.click(screen.getByRole('button', { name: /form\.moreSettings/ }));
    fireEvent.change(screen.getByLabelText('form.exchangeRate'), { target: { value: rate } });
    await user.click(screen.getByRole('button', { name: 'add' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'add' })).toBeDisabled();
  }
);

it('still rejects a finite quote whose converted amount exceeds the ledger limit', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  renderForm({
    currencySettings: {
      default_currency: 'USD',
      currencies: [{ code: 'USD', rate: 10000000.123456789 }],
    },
    onSubmit,
  });
  await user.type(screen.getByLabelText('amount'), '1000');
  await user.type(screen.getByLabelText('form.description'), 'Overflow');
  await user.click(screen.getByRole('button', { name: /form\.moreSettings/ }));
  await user.click(screen.getByRole('button', { name: 'add' }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('error.exchangeRateRequired')).toBeInTheDocument();
});
