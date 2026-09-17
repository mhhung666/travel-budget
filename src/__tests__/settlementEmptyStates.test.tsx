import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettlementPlan from '@/components/settlement/SettlementPlan';
import SettlementSummary from '@/components/settlement/SettlementSummary';

afterEach(cleanup);

const zeroBalance = { userId: 'a', username: 'A', totalPaid: 0, totalOwed: 0, balance: 0 };

function renderPlan(props: Partial<Parameters<typeof SettlementPlan>[0]> = {}) {
  return render(
    <SettlementPlan transactions={[]} exchangeRates={{}} loadingRates={false} {...props} />
  );
}

describe('settlement plan without transfers', () => {
  it('says there is nothing to settle yet and offers the first expense', async () => {
    const onAddExpense = vi.fn();
    renderPlan({ hasExpenses: false, onAddExpense });

    expect(screen.getByText('noExpensesTitle')).toBeInTheDocument();
    expect(screen.queryByText('allSettledTitle')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'addFirstExpense' }));
    expect(onAddExpense).toHaveBeenCalledTimes(1);
  });

  it('hides the first-expense button from viewers who cannot add', () => {
    renderPlan({ hasExpenses: false });
    expect(screen.getByText('noExpensesReadOnly')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'addFirstExpense' })).not.toBeInTheDocument();
  });

  it('calls balanced expenses "no transfers needed", not settled', () => {
    renderPlan({ hasExpenses: true });
    expect(screen.getByText('noTransfersTitle')).toBeInTheDocument();
    expect(screen.queryByText('allSettledTitle')).not.toBeInTheDocument();
  });

  it('celebrates only after repayments bring everyone to zero', () => {
    renderPlan({ hasExpenses: true, hasPayments: true });
    expect(screen.getByText('allSettledTitle')).toBeInTheDocument();
  });
});

describe('settlement summary at a zero balance', () => {
  it('does not call an empty trip settled', () => {
    render(<SettlementSummary totalExpenses={0} myBalance={zeroBalance} />);
    expect(screen.getByText('noExpensesTitle')).toBeInTheDocument();
    expect(screen.queryByText('youSettled')).not.toBeInTheDocument();
    expect(screen.queryByText('🎉')).not.toBeInTheDocument();
  });

  it('says no transfer is needed when my share already matches what I paid', () => {
    render(
      <SettlementSummary
        totalExpenses={100}
        myBalance={{ ...zeroBalance, totalPaid: 50, totalOwed: 50 }}
      />
    );
    expect(screen.getByText('youNoTransfer')).toBeInTheDocument();
    expect(screen.queryByText('🎉')).not.toBeInTheDocument();
  });

  it('celebrates when my repayments settled the balance', () => {
    render(
      <SettlementSummary
        totalExpenses={100}
        myBalance={{ ...zeroBalance, totalPaid: 0, totalOwed: 50 }}
        hasMyPayments
      />
    );
    expect(screen.getByText('youSettled')).toBeInTheDocument();
    expect(screen.getByText('🎉')).toBeInTheDocument();
  });
});
