import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatCurrency } from '@/constants/currencies';
import { computeSplits, reconstructOriginalShares } from '@/lib/expenseSplit';
import type { Expense, Member } from '@/types';

// 帶參數的翻譯要把金額渲染出來，才驗得到畫面上的數字。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${Object.values(params).join('|')})` : key,
  useLocale: () => 'zh',
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/components/trips/detail/ReceiptAttachments', () => ({
  ReceiptUploader: () => null,
  ReceiptThumb: () => null,
}));

import ExpenseFormSheet from '@/components/trips/detail/expense-form/ExpenseFormSheet';
import SettlementPlan from '@/components/settlement/SettlementPlan';

const member = (id: string, name: string) =>
  ({ id, username: id, display_name: name, joined_at: '2026-01-01', role: 'member' }) as Member;
const two = [member('amy', 'Amy'), member('ben', 'Ben')];
const three = [...two, member('cat', 'Cat')];

const everyone = (members: Member[]) =>
  members.map((m) => ({ id: m.id, selected: true, value: '' }));
const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('amount formatting keeps cents', () => {
  it('drops trailing zeros and never pads integers', () => {
    expect(formatCurrency(123, 'TWD')).toBe('NT$123');
    expect(formatCurrency(61.5, 'TWD')).toBe('NT$61.5');
    expect(formatCurrency(33.34, 'TWD')).toBe('NT$33.34');
    expect(formatCurrency(333.5, 'JPY')).toBe('¥333.5');
  });
});

describe('split allocation', () => {
  it('splits 123 between two as 61.5 each', () => {
    const split = computeSplits('equal', everyone(two), 123, 1);
    expect(Object.values(split.twd)).toEqual([61.5, 61.5]);
    expect(split.allocatedTWD).toBe(123);
  });

  it('gives the 100 / 3 remainder to the first member and sums to the total', () => {
    const split = computeSplits('equal', everyone(three), 100, 1);
    expect(three.map((m) => split.twd[m.id])).toEqual([33.34, 33.33, 33.33]);
    expect(sum(Object.values(split.twd))).toBe(100);
  });

  it('keeps JPY share decimals instead of hiding them', () => {
    const split = computeSplits('equal', everyone(three), 1000, 0.2);
    expect(three.map((m) => split.original[m.id])).toEqual([333.34, 333.33, 333.33]);
    expect(three.map((m) => formatCurrency(split.original[m.id], 'JPY'))).toEqual([
      '¥333.34',
      '¥333.33',
      '¥333.33',
    ]);
    expect(sum(Object.values(split.twd))).toBe(200);
  });

  it('keeps a stored remainder on the same member when reopened', () => {
    const { shares, equal } = reconstructOriginalShares(100, [33.33, 33.34, 33.33]);
    expect(shares).toEqual([33.33, 33.34, 33.33]);
    expect(equal).toBe(false);
  });
});

function renderForm(props: Partial<Parameters<typeof ExpenseFormSheet>[0]>) {
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
      tripId={`trip-${Math.random()}`}
      open
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      members={two}
      currentUser={{ id: 'amy' }}
      {...props}
    />
  );
}

// 付款人選單也列出成員名，改由分帳列的 checkbox label 找到該列。
const shareOf = (name: string) =>
  within(screen.getByLabelText(name).closest('div.rounded-lg') as HTMLElement).getByText(/^NT\$/)
    .textContent;

async function openSplit(user: ReturnType<typeof userEvent.setup>) {
  const toggle = screen.getByRole('button', { name: /form\.splitWith/ });
  if (toggle.getAttribute('aria-expanded') !== 'true') await user.click(toggle);
}

describe('expense form split display', () => {
  it('shows 61.5 per person for 123 / 2 and the exact allocated total', async () => {
    const user = userEvent.setup();
    renderForm({});
    await user.type(screen.getByLabelText('amount'), '123');

    expect(screen.getByText('form.summary.equalSplit(2|NT$61.5)')).toBeInTheDocument();
    await openSplit(user);
    expect([shareOf('Amy'), shareOf('Ben')]).toEqual(['NT$61.5', 'NT$61.5']);
    expect(screen.getByText('split.allocated(NT$123|NT$123)')).toBeInTheDocument();
  });

  it('does not claim a single per-person amount when 100 / 3 has a remainder', async () => {
    const user = userEvent.setup();
    renderForm({ members: three });
    await user.type(screen.getByLabelText('amount'), '100');

    expect(screen.getByText('form.summary.equalSplitUneven(3)')).toBeInTheDocument();
    await openSplit(user);
    expect([shareOf('Amy'), shareOf('Ben'), shareOf('Cat')]).toEqual([
      'NT$33.34',
      'NT$33.33',
      'NT$33.33',
    ]);
    expect(screen.getByText('split.allocated(NT$100|NT$100)')).toBeInTheDocument();
  });

  it('shows the saved shares unchanged when editing', async () => {
    const user = userEvent.setup();
    const split = (m: Member, share: number) => ({
      user_id: m.id,
      username: m.username,
      display_name: m.display_name,
      share_amount: share,
    });
    const expense = {
      id: 'e1',
      trip_id: 'trip',
      payer_id: 'amy',
      payer_name: 'Amy',
      amount: 100,
      original_amount: 100,
      currency: 'TWD',
      exchange_rate: 1,
      description: 'Dinner',
      category: 'food',
      date: '2026-09-17',
      created_at: '2026-09-17',
      splits: [split(three[0], 33.33), split(three[1], 33.34), split(three[2], 33.33)],
      attachments: [],
      itinerary_day_ids: [],
      tags: [],
    } satisfies Expense;
    renderForm({ mode: 'edit', expense, members: three });

    await openSplit(user);
    expect([shareOf('Amy'), shareOf('Ben'), shareOf('Cat')]).toEqual([
      'NT$33.33',
      'NT$33.34',
      'NT$33.33',
    ]);
  });
});

describe('settlement plan reference amounts', () => {
  it('marks converted foreign amounts as approximate and keeps TWD exact', async () => {
    // Radix Select 依賴 jsdom 沒有的 pointer capture／scrollIntoView。
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
    const user = userEvent.setup();
    render(
      <SettlementPlan
        transactions={[{ from: 'Amy', to: 'Ben', amount: 61.5 }]}
        exchangeRates={{ TWD: 1, JPY: 0.2 }}
        loadingRates={false}
        currencyOptions={['TWD', 'JPY']}
        onMarkPaid={vi.fn()}
      />
    );
    expect(screen.getByText('NT$61.5')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'JPY' }));
    expect(screen.getByText('approxAmount(¥307.5)')).toBeInTheDocument();
    expect(screen.getByText('(NT$61.5)')).toBeInTheDocument();
  });
});
