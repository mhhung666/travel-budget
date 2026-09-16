import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SettlementPlan from '@/components/settlement/SettlementPlan';

afterEach(cleanup);

const transactions = [
  { from: 'Amy', to: 'Ben', amount: 1000 },
  { from: 'Ben', to: 'Amy', amount: 500 },
  { from: 'Cat', to: 'Ben', amount: 300 },
];

it('labels the settle button by the viewer role in each transfer', () => {
  render(
    <SettlementPlan
      transactions={transactions}
      exchangeRates={{}}
      loadingRates={false}
      onMarkPaid={vi.fn()}
      currentUserName="Amy"
    />
  );

  const buttons = screen.getAllByRole('button', { name: /^(iPaid|confirmReceived|markPaid)$/ });
  expect(buttons.map((b) => b.textContent)).toEqual(['iPaid', 'confirmReceived', 'markPaid']);
});
