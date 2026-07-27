import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (...parts: string[]) =>
  readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

describe('Phase 2A first-use experience contracts', () => {
  it('keeps both create and join actions in the empty trips state', () => {
    const source = readSource('components', 'trips', 'EmptyTripsState.tsx');

    expect(source).toContain('onCreate');
    expect(source).toContain('onJoin');
    expect(source).toContain("t('createTrip')");
    expect(source).toContain("t('joinTrip')");
  });

  it('navigates directly into the newly created trip', () => {
    const dialog = readSource('components', 'trips', 'CreateTripDialog.tsx');
    const page = readSource('app', '(app)', 'trips', 'page.tsx');

    expect(dialog).toContain('onSuccess(createdTrip)');
    expect(page).toContain('ROUTES.TRIP_DETAIL(trip.hash_code)');
    expect(page).toContain('router.push');
  });

  it('progressively discloses optional trip fields', () => {
    const source = readSource('components', 'trips', 'CreateTripDialog.tsx');

    expect(source).toContain('<Collapsible open={detailsOpen}');
    expect(source).toContain("t('create.moreDetails')");
    expect(source).toContain('useFriends(open && detailsOpen)');
  });

  it.each([
    ['expense', readSource('components', 'trips', 'detail', 'TripExpenses.tsx')],
    ['itinerary', readSource('app', '(app)', 'trips', '[id]', 'page.tsx')],
    ['checklist', readSource('app', '(app)', 'trips', '[id]', 'checklists', 'page.tsx')],
    ['album', readSource('app', '(app)', 'trips', '[id]', 'album', 'page.tsx')],
  ])('keeps an action in the %s empty state', (_name, source) => {
    expect(source).toMatch(/<EmptyState[\s\S]*?action=/);
  });

  it('keeps first expense and invite actions in the lightweight checklist', () => {
    const source = readSource('components', 'trips', 'detail', 'FirstStepsCard.tsx');

    expect(source).toContain("key: 'expense'");
    expect(source).toContain("key: 'invite'");
    expect(source).toContain('if (hasExpense && hasInvited) return null');
    expect(source).toContain('onDismiss');
  });
});
