import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (...parts: string[]) =>
  readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

describe('lightweight trip shell loading contracts', () => {
  it('keeps global flow imports behind the visible entry and pure helpers out of editor UI', () => {
    const app = readSource('components', 'layout', 'AppShell.tsx');
    expect(app).toContain("await import('./GlobalQuickAddFlow')");
    expect(app).toContain('{user && quickAddVisible && (');
    expect(app).toContain("from '@/lib/quickAdd'");
    const page = readSource('app', '(app)', 'trips', '[id]', 'page.tsx');
    expect(page).toContain("from '@/lib/activityDraft'");
    expect(page).not.toContain('itinerary/ActivityListEditor');
  });

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

    const dialogs = readSource('components', 'trips', 'DeferredDialogs.tsx');
    expect(shell).toContain("from '@/components/trips/DeferredDialogs'");
    expect(dialogs).toContain("import('./detail/dialogs/BudgetDialog')");
    expect(dialogs).toContain("import('./detail/expense-form/ExpenseFormSheet')");
    expect(shell).toContain('{addExpenseDialog.open && (');
    expect(shell).toContain('open={formReady}');
    expect(shell).toMatch(/<ExpenseFormSheet\s+preload/);
    expect(shell).toContain('{budgetDialog.open && (');
  });
});
