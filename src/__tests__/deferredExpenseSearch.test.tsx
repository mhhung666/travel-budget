import { Profiler, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import TripExpenses from '@/components/trips/detail/TripExpenses';
import { EMPTY_EXPENSE_FILTERS } from '@/lib/expenseFilters';
import type { Expense } from '@/types';

vi.mock('@/hooks/queries', () => ({ useCommentCounts: () => ({ data: {} }) }));
vi.mock('@/components/export', () => ({ ExportMenu: () => null }));
vi.mock('@/components/trips/detail/ExpenseListItem', () => ({
  default: ({ expense, onDelete }: { expense: Expense; onDelete: (id: string) => void }) => (
    <button data-testid="row" onClick={() => onDelete(expense.id)}>
      {expense.description}
    </button>
  ),
}));
afterEach(cleanup);
const expenses: Expense[] = Array.from({ length: 45 }, (_, i) => ({
  id: String(i),
  trip_id: 't1',
  payer_id: 'u1',
  payer_name: 'Alice',
  amount: 10,
  original_amount: 10,
  currency: 'TWD',
  exchange_rate: 1,
  description: i === 44 ? 'Sushi' : `Coffee ${i}`,
  category: 'food',
  date: '2026-09-08',
  created_at: '2026-09-08',
  splits: [],
  attachments: [],
  itinerary_day_ids: [],
  tags: [],
}));
const noop = () => {};
const members: [] = [];
function Harness({ onDelete = noop }: { onDelete?: (id: string) => void }) {
  const [filters, setFilters] = useState(EMPTY_EXPENSE_FILTERS);
  return (
    <TripExpenses
      tripId="t1"
      expenses={expenses}
      members={members}
      isCurrentUserMember={false}
      isCurrentUserAdmin={false}
      filters={filters}
      onFiltersChange={setFilters}
      onAdd={noop}
      onEdit={noop}
      onDelete={onDelete}
    />
  );
}

it('commits the input before replacing results and marks the old results busy', () => {
  const commits: { input: string; count: number; busy: boolean }[] = [];
  render(
    <Profiler
      id="search"
      onRender={() => {
        const input = document.querySelector<HTMLInputElement>('#expense-search');
        if (input)
          commits.push({
            input: input.value,
            count: screen.queryAllByTestId('row').length,
            busy: !!document.querySelector('[aria-busy="true"]'),
          });
      }}
    >
      <Harness />
    </Profiler>
  );
  fireEvent.change(screen.getByLabelText('search'), { target: { value: 'Sushi' } });
  expect(commits).toContainEqual({ input: 'Sushi', count: 20, busy: true });
  expect(commits.at(-1)).toEqual({ input: 'Sushi', count: 1, busy: false });
  expect(screen.getByTestId('row')).toHaveTextContent('Sushi');
});

it('resets progressive rows on settled search/clear and keeps the selected expense id', () => {
  const onDelete = vi.fn();
  render(<Harness onDelete={onDelete} />);
  fireEvent.click(screen.getByRole('button', { name: /showMore/ }));
  expect(screen.getAllByTestId('row')).toHaveLength(40);
  fireEvent.change(screen.getByLabelText('search'), { target: { value: 'Sushi' } });
  fireEvent.click(screen.getByTestId('row'));
  expect(onDelete).toHaveBeenCalledWith('44');
  fireEvent.change(screen.getByLabelText('search'), { target: { value: '' } });
  expect(screen.getAllByTestId('row')).toHaveLength(20);
  fireEvent.change(screen.getByLabelText('search'), { target: { value: 'missing' } });
  expect(screen.getByText('noFilterResults')).toBeInTheDocument();
  expect(screen.getByLabelText('search')).toHaveValue('missing');
});
