import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { ProfileScreen } from './ProfileScreen';
import type { ProfileState } from './editor';
import { ApiError } from '@/api/client';
const h = vi.hoisted(() => ({
  state: {} as ProfileState,
  online: true,
  status: 'signedIn',
  version: 1,
  user: { id: 'a'.repeat(24), username: 'alice', displayName: 'Alice' },
  read: vi.fn(),
  save: vi.fn(),
  edit: vi.fn(),
  local: vi.fn(),
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
vi.mock('./editor', () => ({
  ProfileEditor: class {
    read = h.read;
    save = h.save;
    edit = h.edit;
    retryLocal = h.local;
    getSnapshot = () => h.state;
    subscribe = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('react-native', () => ({
  Alert: { alert: h.alert },
  AppState: { currentState: 'active' },
}));
vi.mock('expo-router', () => ({
  router: { push: vi.fn() },
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
vi.mock('@/components/ui', () =>
  Object.fromEntries(
    ['Action', 'Card', 'Copy', 'DetailRow', 'Notice', 'TextField'].map((s) => [s, s])
  )
);
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
  const route = ProfileScreen()!;
  return (route.type as () => ReactElement)();
}
function find(tree: ReactNode, field: string, value: unknown) {
  const node = nodes(tree).find((n) => n.props[field] === value);
  if (!node) throw Error(String(value));
  return node;
}
beforeEach(() => {
  vi.clearAllMocks();
  h.online = true;
  h.status = 'signedIn';
  h.version = 1;
  h.state = {
    name: 'Alice',
    profile: { ...h.user, email: 'alice@example.invalid' },
    busy: false,
    uncertain: false,
    localFailed: false,
  };
});
it('keeps username/email read-only, wires explicit save, and guards unsaved back navigation', () => {
  h.state.name = 'New';
  const tree = render();
  expect(nodes(tree).filter((n) => n.type === 'TextField')).toHaveLength(1);
  expect(find(tree, 'label', 'email').props.value).toBe('alice@example.invalid');
  (find(tree, 'testID', 'profile-save').props.onPress as () => void)();
  expect(h.save).toHaveBeenCalledOnce();
  expect(h.guard.mock.calls.at(-1)?.[0]).toBe(true);
  h.guard.mock.calls.at(-1)![1]({ data: { action: 'BACK' } });
  expect(h.dispatch).not.toHaveBeenCalled();
  h.alert.mock.calls.at(-1)![2][1].onPress();
  expect(h.dispatch).toHaveBeenCalledWith('BACK');
});
it('unknown results freeze editing and save, expose lookup, and never show success', () => {
  h.state.uncertain = true;
  h.state.error = new ApiError('NETWORK');
  const tree = render();
  expect(find(tree, 'testID', 'profile-save').props.disabled).toBe(true);
  expect(find(tree, 'testID', 'profile-name').props.editable).toBe(false);
  expect(find(tree, 'testID', 'profile-read').props.label).toBe('checkResult');
  expect(nodes(tree).some((n) => n.props.children === 'profileUnknown')).toBe(true);
  expect(nodes(tree).some((n) => n.props.children === 'profileSaved')).toBe(false);
});
it('distinguishes server success/local failure, offers only local persistence retry and disables offline network actions', () => {
  h.state.result = 'saved';
  h.state.localFailed = true;
  h.online = false;
  const tree = render();
  expect(nodes(tree).some((n) => n.props.children === 'profileSaved')).toBe(true);
  expect(nodes(tree).some((n) => n.props.children === 'profileLocalFailed')).toBe(true);
  (find(tree, 'testID', 'profile-retry-local').props.onPress as () => void)();
  expect(h.local).toHaveBeenCalledOnce();
  expect(h.save).not.toHaveBeenCalled();
  expect(find(tree, 'testID', 'profile-read').props.disabled).toBe(true);
});
it('remounts all form state for a new login generation and excludes local/signed-out profile access', () => {
  const first = ProfileScreen()!;
  h.version++;
  expect(ProfileScreen()!.key).not.toBe(first.key);
  h.status = 'local';
  expect(ProfileScreen()).toBeNull();
  h.status = 'signedOut';
  expect(ProfileScreen()).toBeNull();
});
