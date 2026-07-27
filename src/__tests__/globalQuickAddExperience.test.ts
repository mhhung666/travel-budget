import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (...parts: string[]) =>
  readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

describe('Phase 2B global quick-add contracts', () => {
  it('keeps the quick-add flow mounted in the persistent app shell', () => {
    const source = readSource('components', 'layout', 'AppShell.tsx');

    expect(source).toContain('<GlobalQuickAddFlow');
    expect(source).toContain('quickAddOpen');
    expect(source).toContain('onClick={openQuickAdd}');
  });

  it('uses the high-priority mobile action instead of a stats tab', () => {
    const source = readSource('components', 'layout', 'BottomTabBar.tsx');

    expect(source).toContain('onQuickAdd');
    expect(source).toContain("t('quickAdd')");
    expect(source).not.toContain("href: '/stats'");
  });

  it('shares the global flow between the web UI and PWA route', () => {
    const route = readSource('app', '(app)', 'quick-add', 'page.tsx');
    const flow = readSource('components', 'layout', 'GlobalQuickAddFlow.tsx');

    expect(route).not.toContain('redirect(');
    expect(flow).toContain('decideQuickAddTrip');
    expect(flow).toContain('<TripPicker');
    expect(flow).toContain('<GlobalExpenseForm');
  });

  it('continues into trip creation when no trip exists', () => {
    const source = readSource('components', 'layout', 'GlobalQuickAddFlow.tsx');

    expect(source).toContain('<CreateTripDialog');
    expect(source).toContain('selectTrip(trip)');
  });
});
