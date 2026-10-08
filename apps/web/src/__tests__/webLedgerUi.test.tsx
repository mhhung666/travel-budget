import { cleanup, render, screen, waitFor, act, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExpenseForm } from '@/components/trips/detail/expense-form/useExpenseForm';
import ExpenseFormSheet from '@/components/trips/detail/expense-form/ExpenseFormSheet';
import { exportExpenses, type ExpenseLabels } from '@/lib/exporters/expenses';
import { exportSettlement, type SettlementLabels } from '@/lib/exporters/settlement';
import { buildOptimisticExpense } from '@/lib/optimisticExpense';
import type { Expense, Member } from '@/types';
vi.mock('@/actions/ledger.actions', () => ({
  getTripReferenceRates: vi.fn(async () => ({
    success: true,
    data: {
      ledger: { baseCurrency: 'JPY', moneyScale: 2 },
      rates: { JPY: 1, USD: 150 },
      dates: { USD: '2026-10-08' },
    },
  })),
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/components/trips/detail/ReceiptAttachments', () => ({ ReceiptUploader: () => null }));
const members = ['a', 'b', 'c'].map((id) => ({
  id,
  username: id,
  display_name: id,
  role: 'member',
  joined_at: '2026-01-01',
})) as Member[];
const labels: ExpenseLabels = {
  heading: 'Expenses',
  total: 'Total',
  columns: {
    date: 'Date',
    description: 'Description',
    category: 'Category',
    payer: 'Payer',
    amountTwd: 'Amount',
    originalAmount: 'Original',
    currency: 'Currency',
    rate: 'Rate',
    splits: 'Shares',
    tags: 'Tags',
  },
  category: (k) => k,
};
const settlementLabels: SettlementLabels = {
  heading: 'Settlement',
  totalExpenses: 'Total',
  balancesHeading: 'Balances',
  transfersHeading: 'Transfers',
  noTransfers: 'Settled',
  columns: { member: 'Member', paid: 'Paid', owed: 'Owed', balance: 'Balance' },
};
const row = (baseCurrency = 'JPY'): Expense =>
  buildOptimisticExpense(
    {
      base_currency: baseCurrency,
      payer_id: 'a',
      original_amount: 0.01,
      currency: baseCurrency,
      exchange_rate: 1,
      description: 'Cent',
      category: 'food',
      date: '2026-10-08',
      splits: [{ user_id: 'a', share_amount: 0.01 }],
    },
    { tripId: 'trip', members, id: 'expense', createdAt: '2026-10-08' }
  );
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('Web ledger entry and output', () => {
  it('splits 0.01 JPY in ledger cents, with base rate 1', async () => {
    const { result } = renderHook(() =>
      useExpenseForm({
        mode: 'add',
        tripId: 'trip',
        baseCurrency: 'JPY',
        open: true,
        members,
        currentUser: members[0],
      })
    );
    await waitFor(() => expect(result.current.loadingRates).toBe(false));
    act(() =>
      result.current.setForm((f) => ({ ...f, original_amount: '0.01', description: 'One cent' }))
    );
    const data = result.current.buildSubmitData();
    expect(data).toMatchObject({
      base_currency: 'JPY',
      currency: 'JPY',
      exchange_rate: '1',
      contractVersion: 2,
    });
    expect(data?.splits.map((s) => s.share_amount)).toEqual([0.01, 0, 0]);
    expect(result.current.split.balanced).toBe(true);
  });
  it('allows a metadata-only edit with historical members and preserves their saved shares', async () => {
    const e = {
      ...row(),
      payer_id: 'removed',
      splits: [{ user_id: 'removed', username: 'old', display_name: 'Old', share_amount: 0.01 }],
    };
    const submit = vi.fn(async () => {}),
      user = userEvent.setup();
    render(
      <ExpenseFormSheet
        mode="edit"
        tripId="trip"
        baseCurrency="JPY"
        open
        members={members}
        currentUser={{ id: 'a' }}
        expense={e}
        onClose={vi.fn()}
        onSubmit={submit}
      />
    );
    await user.type(screen.getByLabelText('form.description'), ' changed');
    expect(screen.getByRole('button', { name: 'save' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'save' }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        preserve_money: true,
        splits: [{ user_id: 'removed', share_amount: 0.01 }],
      })
    );
  });
  it('isolates the draft by account and ledger and records its source unit', async () => {
    const { result, rerender } = renderHook(
      ({ actor, base }) =>
        useExpenseForm({
          mode: 'add',
          tripId: 'trip',
          baseCurrency: base,
          open: true,
          members,
          currentUser: actor,
        }),
      { initialProps: { actor: members[0], base: 'JPY' } }
    );
    await waitFor(() => expect(result.current.loadingRates).toBe(false));
    act(() =>
      result.current.setForm((f) => ({ ...f, original_amount: '1.01', description: 'My draft' }))
    );
    expect(result.current.persistDraft()).toBe(true);
    const saved = Object.keys(localStorage)
      .map((k) => localStorage.getItem(k)!)
      .map((s) => JSON.parse(s));
    expect(saved[0].snapshot).toMatchObject({
      ledger: { baseCurrency: 'JPY', moneyScale: 2 },
      contractVersion: 2,
    });
    rerender({ actor: members[1], base: 'JPY' });
    await waitFor(() => expect(result.current.loadingRates).toBe(false));
    expect(result.current.form.description).toBe('');
  });
  it.each(['markdown', 'csv'] as const)(
    'labels JPY ledger cents and original quotes in %s exports',
    (format) => {
      const e = { ...row(), original_amount: 1, currency: 'USD', exchange_rate: 0.01 };
      const out = exportExpenses([e], format, labels, 'JPY').content;
      expect(out).toContain('Amount (JPY)');
      expect(out).toContain('Shares (JPY)');
      expect(out).toContain('USD');
      expect(out).toContain('0.01');
      expect(out).not.toContain('TWD');
    }
  );
  it('includes the ledger in an empty JSON export and forbids mixed money totals', () => {
    expect(JSON.parse(exportExpenses([], 'json', labels, 'JPY').content)).toEqual({
      version: 2,
      ledger: { baseCurrency: 'JPY', moneyScale: 2 },
      expenses: [],
    });
    expect(() => exportExpenses([row('JPY'), row('USD')], 'markdown', labels)).toThrow(
      'LEDGER_CURRENCY_MISMATCH'
    );
  });
  it.each(['markdown', 'csv', 'json'] as const)('labels settlement units in %s', (format) => {
    const out = exportSettlement(
      {
        ledger: { baseCurrency: 'JPY', moneyScale: 2 },
        balances: [],
        transactions: [{ from: 'A', to: 'B', amount: 0.01 }],
        totalExpenses: 0.01,
      },
      format,
      settlementLabels
    ).content;
    expect(out).toContain('JPY');
    expect(out).not.toContain('TWD');
    if (format !== 'csv') expect(out).toContain('0.01');
  });
});
