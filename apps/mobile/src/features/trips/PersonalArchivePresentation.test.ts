import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { PersonalArchive } from './PersonalArchive';
import { messages } from '@/i18n/messages';
const h = vi.hoisted(() => ({
  state: {} as { status: string; archived?: boolean; refreshed?: boolean },
  confirm: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => void) => effect(),
  useLayoutEffect: (effect: () => void) => effect(),
  useRef: (current: unknown) => ({ current }),
  useState: (initial: () => unknown) => [initial()],
  useSyncExternalStore: () => h.state,
}));
vi.mock('./managementRefresh', () => ({ refreshManagedTrip: vi.fn() }));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: vi.fn() }) },
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({}),
}));
vi.mock('@/features/tripEntry/provider', () => ({
  useTripEntry: () => ({
    scope: { environment: 'test', accountId: 'account' },
    entry: { confirm: h.confirm },
    manager: { getSignInVersion: () => 1, api: { environment: 'test' } },
  }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({ catalog: { isVisible: () => true } }),
}));
vi.mock('@/storage/pendingExpenseDatabase', () => ({ openMutationStore: vi.fn() }));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => true }));
vi.mock('@/i18n/useMessages', () => ({ useMessages: () => messages.en }));
vi.mock('@/components/ui', () => ({
  Action: 'Action',
  Copy: 'Copy',
  Notice: 'Notice',
  Section: 'Section',
}));
function controls(props: Parameters<typeof PersonalArchive>[0]) {
  const element = PersonalArchive(props) as ReactElement<Record<string, unknown>>;
  return (element.type as (props: unknown) => ReactElement)(element.props);
}
beforeEach(() => {
  vi.clearAllMocks();
  h.state = { status: 'idle' };
});
it('keeps unknown-result sheet closure blocked without changing settings busy semantics or sending again', () => {
  h.state = { status: 'pending' };
  const onBusy = vi.fn();
  const onCloseBlocked = vi.fn();
  const onSettled = vi.fn();
  const tree = controls({ tripId: 'trip', archived: false, onBusy, onCloseBlocked, onSettled });
  expect(onBusy).toHaveBeenCalledWith(false);
  expect(onCloseBlocked).toHaveBeenCalledWith(true);
  expect(onSettled).not.toHaveBeenCalled();
  expect(tree).toBeTruthy();
  expect(h.confirm).not.toHaveBeenCalled();
});
it.each([
  ['reading', true],
  ['sending', true],
  ['review', false],
  ['error', false],
] as const)('blocks closing only while %s is in flight', (status, blocked) => {
  h.state = { status };
  const onCloseBlocked = vi.fn();
  controls({ tripId: 'trip', archived: false, onCloseBlocked });
  expect(onCloseBlocked).toHaveBeenCalledWith(blocked);
});
it.each([true, false] as const)(
  'only closes a completed sheet after successful list refresh=%s',
  (refreshed) => {
    h.state = { status: 'done', archived: true, refreshed };
    const onSettled = vi.fn();
    const onCommitted = vi.fn();
    controls({ tripId: 'trip', archived: false, onSettled, onCommitted });
    expect(onCommitted).toHaveBeenCalledWith(true);
    expect(onSettled).toHaveBeenCalledTimes(refreshed ? 1 : 0);
    expect(h.confirm).not.toHaveBeenCalled();
  }
);
