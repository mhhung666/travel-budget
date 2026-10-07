import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SettlementPlan from '@/components/settlement/SettlementPlan';

afterEach(cleanup);

const transactions = [
  { from: 'Amy', to: 'Ben', fromId: 'amy', toId: 'ben', amount: 1000 },
  { from: 'Ben', to: 'Amy', fromId: 'ben', toId: 'amy', amount: 500 },
  { from: 'Cat', to: 'Ben', fromId: 'cat', toId: 'ben', amount: 300 },
];

it('labels the settle button by the viewer role in each transfer', () => {
  render(
    <SettlementPlan
      transactions={transactions}
      exchangeRates={{}}
      loadingRates={false}
      onMarkPaid={vi.fn()}
      currentUserId="amy"
    />
  );

  const buttons = screen.getAllByRole('button', { name: /^(iPaid|confirmReceived|markPaid)$/ });
  expect(buttons.map((b) => b.textContent)).toEqual(['iPaid', 'confirmReceived', 'markPaid']);
});

it('distinguishes the viewer, reminder recipient and payment direction by ID for identical names', () => {
  const onMarkPaid = vi.fn();
  render(
    <SettlementPlan
      transactions={[{ from: 'SAME', to: 'SAME', fromId: 'amy', toId: 'ben', amount: 66 }]}
      exchangeRates={{}}
      loadingRates={false}
      onMarkPaid={onMarkPaid}
      onRemind={vi.fn()}
      currentUserId="amy"
    />
  );
  expect(screen.getAllByText('(you)')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'remind' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'iPaid' }));
  expect(onMarkPaid).toHaveBeenCalledWith(
    expect.objectContaining({ fromId: 'amy', toId: 'ben', amount: 66 })
  );
});
