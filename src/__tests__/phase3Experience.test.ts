import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (...parts: string[]) =>
  readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

describe('Phase 3 information architecture contracts', () => {
  it('keeps desktop primary navigation aligned with the mobile model', () => {
    const shell = readSource('components', 'layout', 'AppShell.tsx');
    const mobile = readSource('components', 'layout', 'BottomTabBar.tsx');

    expect(shell).toContain('primaryNavLinks');
    expect(shell).toContain('personalNavLinks');
    expect(mobile).toContain("target: 'trips'");
    expect(mobile).toContain("target: 'map'");
    expect(mobile).toContain("target: 'me'");
  });

  it('tracks only a fixed, privacy-safe navigation taxonomy', () => {
    const source = readSource('lib', 'navigationEvents.ts');

    expect(source).toContain("track('navigation_used', { target, surface })");
    expect(source).toContain(
      'export function trackNavigation(target: NavigationTarget, surface: NavigationSurface)'
    );
    expect(source).not.toMatch(/track\([^)]*(tripId|hashCode|amount|description|userId)/);
  });

  it('compacts the trip shell and avoids duplicate subtab names', () => {
    const source = readSource('components', 'trips', 'space', 'TripSpaceShell.tsx');

    expect(source).toContain('isCompact');
    expect(source).toContain('window.scrollY > 48');
    expect(source).toContain("tTrip('tabs.dailyItinerary')");
    expect(source).toContain("tTrip('tabs.settlementPlan')");
    expect(source).toContain("tTrip('tabs.groupStats')");
  });

  it('renders a contextual before/during/after trip home', () => {
    const page = readSource('app', '(app)', 'trips', '[id]', 'page.tsx');
    const overview = readSource('components', 'trips', 'detail', 'TripContextOverview.tsx');

    expect(page).toContain('<TripContextOverview');
    expect(overview).toContain("phase.phase === 'preTrip'");
    expect(overview).toContain("phase.phase === 'ongoing'");
    expect(overview).toContain("phase.phase === 'postTrip'");
  });

  it('parses invitation URLs and enters the joined trip directly', () => {
    const dialog = readSource('components', 'trips', 'JoinTripDialog.tsx');
    const tripsPage = readSource('app', '(app)', 'trips', 'page.tsx');
    const login = readSource('components', 'login', 'LoginForm.tsx');

    expect(dialog).toContain('parseTripInviteInput');
    expect(dialog).toContain('onSuccess(joinedTrip)');
    expect(tripsPage).toContain('ROUTES.TRIP_DETAIL(trip.hash_code)');
    expect(login).toContain("router.push(redirectTo ?? '/trips')");
  });

  it('preserves the no-trip to first-expense continuation from Phase 2B', () => {
    const source = readSource('components', 'layout', 'GlobalQuickAddFlow.tsx');

    expect(source).toContain('<CreateTripDialog');
    expect(source).toContain("selectTrip(trip, 'created')");
  });
});
