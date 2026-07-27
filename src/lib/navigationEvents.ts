import { track } from '@vercel/analytics';

export type NavigationTarget =
  | 'trips'
  | 'map'
  | 'quick_add'
  | 'me'
  | 'stats'
  | 'collections'
  | 'memberships'
  | 'wrapped'
  | 'settings';

export type NavigationSurface = 'desktop_header' | 'mobile_tab' | 'me_menu';

/**
 * Phase 3 navigation baseline.
 *
 * Only fixed taxonomy values are accepted. Never add a trip/member identifier,
 * invitation code, expense detail, amount, or user-entered text here.
 */
export function trackNavigation(target: NavigationTarget, surface: NavigationSurface) {
  track('navigation_used', { target, surface });
}
