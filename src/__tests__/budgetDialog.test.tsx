import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BudgetDialog from '@/components/trips/detail/dialogs/BudgetDialog';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BudgetDialog', { timeout: 15_000 }, () => {
  it('prioritizes the total budget and keeps category details collapsed when unused', async () => {
    const user = userEvent.setup();

    render(
      <BudgetDialog
        open
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        budget={{ total: 30000, categories: [] }}
      />
    );

    expect(screen.getByLabelText('dialog.totalLabel')).toHaveValue(30000);
    expect(screen.getByText('dialog.private')).toBeInTheDocument();
    expect(screen.queryByLabelText('food')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /dialog.categoriesTitle/ }));
    expect(screen.getByLabelText('food')).toBeInTheDocument();
  });

  it('submits the total and configured category amounts', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <BudgetDialog
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
        budget={{ total: 30000, categories: [{ category: 'food', amount: 8000 }] }}
      />
    );

    const food = screen.getByLabelText('food');
    await user.clear(food);
    await user.type(food, '9000');
    await user.click(screen.getByRole('button', { name: 'dialog.save' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        total: 30000,
        categories: [{ category: 'food', amount: 9000 }],
      })
    );
  });

  it('clears every field as a reversible draft before saving', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <BudgetDialog
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
        budget={{ total: 30000, categories: [{ category: 'food', amount: 8000 }] }}
      />
    );

    await user.click(screen.getByRole('button', { name: 'dialog.clear' }));
    expect(screen.getByLabelText('dialog.totalLabel')).toHaveValue(null);
    expect(screen.getByLabelText('food')).toHaveValue(null);

    await user.click(screen.getByRole('button', { name: 'dialog.save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ total: null, categories: [] }));
  });
});
