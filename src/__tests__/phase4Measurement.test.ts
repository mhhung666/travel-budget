import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (...parts: string[]) =>
  readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

describe('Phase 4 measurement contracts', () => {
  it('keeps activation steps at the successful workflow boundaries', () => {
    const login = readSource('components', 'login', 'LoginForm.tsx');
    const trip = readSource('components', 'trips', 'CreateTripDialog.tsx');
    const itinerary = readSource('app', '(app)', 'trips', '[id]', 'page.tsx');
    const expenses = readSource('hooks', 'queries', 'useExpenseMutations.ts');

    expect(login).toContain("{ step: 'registered' }");
    expect(trip).toContain("{ step: 'trip_created' }");
    expect(trip).toContain("{ step: 'companion_added' }");
    expect(itinerary).toContain("{ step: 'invite_shared' }");
    expect(expenses).toContain("{ step: 'expense_created' }");
  });

  it('measures each global quick-add branch without a trip identifier', () => {
    const source = readSource('components', 'layout', 'GlobalQuickAddFlow.tsx');

    expect(source).toContain("'picker_shown' | 'trip_creation_shown' | 'form_opened'");
    expect(source).toContain("stage: 'expense_submitted'");
    expect(source).toContain("path: 'direct' | 'picker' | 'created'");
  });

  it('buckets edit/delete corrections instead of sending exact timestamps', () => {
    const source = readSource('hooks', 'useTripDetailPage.ts');

    expect(source).toContain("action: 'edited'");
    expect(source).toContain("action: 'deleted'");
    expect(source).toContain('getCorrectionTiming');
  });

  it('covers offline queue, recovery, and failure states', () => {
    const live = readSource('hooks', 'queries', 'useExpenseMutations.ts');
    const resumed = readSource('lib', 'offlineMutations.ts');

    expect(live).toContain("{ state: 'queued' }");
    expect(live).toContain("{ state: 'synced' }");
    expect(live).toContain("{ state: 'failed' }");
    expect(resumed).toContain("{ state: 'synced' }");
    expect(resumed).toContain("{ state: 'failed' }");
  });
});
