import { expect, it, vi } from 'vitest';
import { ExpenseSearchScreen } from './ExpenseSearchScreen';
import { ExpenseBrowseRegistry } from './browse';
import { ExpenseSearchReader } from './search';
const h = vi.hoisted(() => ({
  effect: () => {},
  dismiss: vi.fn(),
  registry: null as ExpenseBrowseRegistry | null,
}));
vi.mock('react', () => ({
  useEffect: (effect: () => void) => {
    h.effect = effect;
  },
}));
vi.mock('expo-router', () => ({ router: { dismissTo: h.dismiss } }));
vi.mock('./browseProvider', () => ({
  useExpenseBrowse: (tripId: string) => ({ session: h.registry!.get(tripId) }),
}));
it.each([false, true])(
  'legacy search entry reuses the existing trip tools (already open: %s) without rendering another list or pushing a route',
  (open) => {
    const read = vi.fn();
    h.dismiss.mockClear();
    h.registry = new ExpenseBrowseRegistry(
      () => new ExpenseSearchReader({ guard: async () => () => {}, read, failure: async () => {} })
    );
    const session = h.registry.get('trip');
    if (open) session.tools();
    session.fields({ keyword: 'unfinished' });
    expect(ExpenseSearchScreen({ tripId: 'trip' })).toBeNull();
    h.effect();
    expect(h.registry.get('trip')).toBe(session);
    expect(session.getSnapshot().tools).toBe(true);
    expect(session.getSnapshot().fields.keyword).toBe('unfinished');
    expect(read).not.toHaveBeenCalled();
    expect(h.registry.get('other').getSnapshot().tools).toBe(false);
    expect(h.dismiss).toHaveBeenCalledWith({
      pathname: '/trips/[id]/expenses',
      params: { id: 'trip' },
    });
  }
);
