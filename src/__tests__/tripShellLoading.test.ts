import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (...parts: string[]) =>
  readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

describe('lightweight trip shell loading contracts', () => {
  it('keeps full expense rows out of the shared shell and itinerary landing page', () => {
    const controller = readSource('hooks', 'useTripSpace.ts');
    const landing = readSource('app', '(app)', 'trips', '[id]', 'page.tsx');

    expect(controller).toContain('useTripShell(tripId)');
    expect(controller).not.toContain('useExpenses(');
    expect(landing).not.toContain('useExpenses(');
    expect(landing).toContain('shell?.expense_count');
    expect(landing).toContain('shell?.today_spent');
  });

  it('enables expense-form metadata only after the form is requested', () => {
    const controller = readSource('hooks', 'useTripSpace.ts');

    expect(controller).toContain('loadExpenseForm || addExpenseDialog.open');
    expect(controller).toContain('useMembers(tripId, shouldLoadForm)');
    expect(controller).toMatch(/useExpenseTags\(\s*tripId,\s*shouldLoadForm/);
    expect(controller).toMatch(/useItinerary\([\s\S]*shouldLoadForm/);
  });

  it('splits large shell dialogs into on-demand chunks and mounts them conditionally', () => {
    const shell = readSource('components', 'trips', 'space', 'TripSpaceShell.tsx');

    expect(shell).toContain(
      "dynamic(() => import('@/components/trips/detail/dialogs/BudgetDialog')"
    );
    expect(shell).toContain("import('@/components/trips/detail/expense-form/ExpenseFormSheet')");
    expect(shell).toContain('{addExpenseDialog.open && (');
    expect(shell).toContain('open={!isMembershipLoading && currentUser != null');
    expect(shell).toContain('{budgetDialog.open && (');
  });
});
