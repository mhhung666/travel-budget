import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { FriendsScreen } from './FriendsScreen';
import type { FriendsState } from './FriendsManager';
import { ApiError } from '@/api/client';
const h = vi.hoisted(() => ({
  state: {} as FriendsState,
  online: true,
  status: 'signedIn',
  version: 1,
  user: { id: 'a'.repeat(24), username: 'alice', displayName: 'Alice' },
  read: vi.fn(),
  mutate: vi.fn(),
  params: {} as { tripId?: string; targetUserId?: string },
  visible: true,
  guard: vi.fn(),
  dispatch: vi.fn(),
  back: vi.fn(),
  alert: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useCallback: (fn: unknown) => fn,
  useState: (v: unknown) => [typeof v === 'function' ? (v as () => unknown)() : v, vi.fn()],
  useRef: (v: unknown) => ({ current: v }),
  useEffect: (effect: () => void) => effect(),
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock('./FriendsManager', () => ({
  FriendsManager: class {
    read = h.read;
    mutate = h.mutate;
    getSnapshot = () => h.state;
    subscribe = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({
    catalog: { isVisible: () => h.visible, captureAccess: () => vi.fn() },
  }),
}));
vi.mock('@/features/profile/AccountAvatar', () => ({ AvatarImage: 'AvatarImage' }));
vi.mock('react-native', () => ({
  Alert: { alert: h.alert },
  AppState: { currentState: 'active' },
  Switch: 'Switch',
}));
vi.mock('expo-router', () => ({
  router: { push: vi.fn() },
  useLocalSearchParams: () => h.params,
  useNavigation: () => ({ dispatch: h.dispatch }),
  useFocusEffect: (fn: () => void) => fn(),
}));
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: h.guard }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: h.status,
    user: h.user,
    manager: { api: { environment: 'https://example/api/v1' }, getSignInVersion: () => h.version },
  }),
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('@/components/screen', () => ({ FormPage: 'FormPage' }));
vi.mock('@/components/navigation', () => ({ goBack: h.back }));
vi.mock('@/components/ui', () => ({
  usePalette: () => ({ primary: '#123', border: '#456' }),
  ...Object.fromEntries(['Action', 'Card', 'Copy', 'Section', 'Notice', 'Chip'].map((s) => [s, s])),
}));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => new Proxy({}, { get: (_o, k) => String(k) }),
}));
type Element = ReactElement<Record<string, unknown>>;
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const e = node as Element;
  return [e, ...nodes(e.props.children as ReactNode)];
}
function render() {
  const route = FriendsScreen()!;
  return (route.type as (props: object) => ReactElement)(route.props);
}
function find(tree: ReactNode, field: string, value: unknown) {
  const node = nodes(tree).find((n) => n.props[field] === value);
  if (!node) throw Error(String(value));
  return node;
}
const row = {
  id: 'c'.repeat(24),
  status: 'pending' as const,
  requestedByMe: false,
  user: { id: 'b'.repeat(24), username: 'bob', displayName: 'Bob', avatarUrl: null },
  createdAt: '2026-10-12T00:00:00.000Z',
};
beforeEach(() => {
  vi.clearAllMocks();
  h.online = h.visible = true;
  h.params = {};
  h.status = 'signedIn';
  h.version = 1;
  h.state = {
    data: {
      friends: [{ ...row, id: 'd'.repeat(24), status: 'accepted' }],
      incoming: [row],
      outgoing: [{ ...row, id: 'e'.repeat(24), requestedByMe: true }],
    },
    busy: false,
    uncertain: false,
    needsRefresh: false,
  };
});
it('shows three relationship groups and explicit directional controls; removal requires confirmation', () => {
  const tree = render();
  expect(h.read).toHaveBeenCalledOnce();
  (find(tree, 'testID', `friend-accept-${row.id}`).props.onPress as () => void)();
  expect(h.mutate).toHaveBeenLastCalledWith('accept', row.id);
  (find(tree, 'testID', `friend-decline-${row.id}`).props.onPress as () => void)();
  expect(h.mutate).toHaveBeenLastCalledWith('decline', row.id);
  (find(tree, 'testID', `friend-withdraw-${'e'.repeat(24)}`).props.onPress as () => void)();
  expect(h.mutate).toHaveBeenLastCalledWith('withdraw', 'e'.repeat(24));
  h.mutate.mockClear();
  (find(tree, 'testID', `friend-remove-${'d'.repeat(24)}`).props.onPress as () => void)();
  expect(h.mutate).not.toHaveBeenCalled();
  expect(h.alert.mock.calls.at(-1)![1]).toContain('@bob');
  h.alert.mock.calls.at(-1)![2][1].onPress();
  expect(h.mutate).toHaveBeenCalledWith('remove', 'd'.repeat(24));
});
it('unknown outcomes lock writes and show recheck plus guarded leave without claiming success', () => {
  h.state.uncertain = true;
  const tree = render();
  for (const n of nodes(tree).filter((n) => String(n.props.testID).startsWith('friend-')))
    expect(n.props.disabled).toBe(true);
  expect(find(tree, 'testID', 'friends-read').props.label).toBe('checkResult');
  expect(find(tree, 'children', 'friendUnknown')).toBeDefined();
  expect(h.guard.mock.calls.at(-1)![0]).toBe(true);
  h.guard.mock.calls.at(-1)![1]({ data: { action: 'BACK' } });
  h.alert.mock.calls.at(-1)![2][1].onPress();
  expect(h.dispatch).toHaveBeenCalledWith('BACK');
});
it('keeps confirmed success visible on refresh failure and provides retry; absent data has no fabricated rows', () => {
  h.state.result = 'accepted';
  h.state.needsRefresh = true;
  h.state.error = new ApiError('NETWORK');
  let tree = render();
  expect(find(tree, 'children', 'friendAccepted')).toBeDefined();
  expect(find(tree, 'children', 'friendRefreshNeeded')).toBeDefined();
  expect(find(tree, 'testID', 'friends-read').props.label).toBe('retry');
  h.state.data = undefined;
  tree = render();
  expect(nodes(tree).some((n) => String(n.props.testID).startsWith('friend-'))).toBe(false);
  h.online = false;
  expect(find(render(), 'testID', 'friends-read').props.disabled).toBe(true);
});
it('hides revoked source identity, remounts on account generation/source and excludes local accounts', () => {
  const first = FriendsScreen()!;
  h.version++;
  expect(FriendsScreen()!.key).not.toBe(first.key);
  h.params = { tripId: 'f'.repeat(24), targetUserId: row.user.id };
  h.state.candidate = { id: row.user.id, name: 'PRIVATE name', roster: [] };
  h.visible = false;
  expect(nodes(render()).some((n) => String(n.props.children).includes('PRIVATE name'))).toBe(
    false
  );
  h.status = 'local';
  expect(FriendsScreen()).toBeNull();
  h.status = 'signedOut';
  expect(FriendsScreen()).toBeNull();
});
