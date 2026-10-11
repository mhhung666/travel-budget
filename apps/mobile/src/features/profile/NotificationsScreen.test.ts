import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { NotificationsScreen } from './NotificationsScreen';
import type { NotificationState } from './NotificationEditor';
import { ApiError } from '@/api/client';
const h = vi.hoisted(() => ({
  state: {} as NotificationState,
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
vi.mock('./NotificationEditor', () => ({
  NotificationEditor: class {
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
  Switch: 'Switch',
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
  const route = NotificationsScreen()!;
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
    preferences: { notifyByEmail: true, locale: 'zh' },
    draft: { notifyByEmail: false, locale: 'en' },
    busy: false,
    uncertain: false,
  };
});
it('loads account preferences, edits both controls and requires an explicit save', () => {
  const tree = render();
  expect(h.read).toHaveBeenCalledOnce();
  (find(tree, 'testID', 'notification-email').props.onValueChange as (v: boolean) => void)(true);
  expect(h.edit).toHaveBeenCalledWith({ notifyByEmail: true });
  (find(tree, 'testID', 'notification-language-jp').props.onPress as () => void)();
  expect(h.edit).toHaveBeenCalledWith({ locale: 'jp' });
  expect(h.save).not.toHaveBeenCalled();
  (find(tree, 'testID', 'notification-save').props.onPress as () => void)();
  expect(h.save).toHaveBeenCalledOnce();
  expect(h.guard.mock.calls.at(-1)?.[0]).toBe(true);
  h.guard.mock.calls.at(-1)![1]({ data: { action: 'BACK' } });
  expect(h.dispatch).not.toHaveBeenCalled();
  h.alert.mock.calls.at(-1)![2][1].onPress();
  expect(h.dispatch).toHaveBeenCalledWith('BACK');
});
it('uncertain outcomes disable all edits and save; lookup shows current without claiming saved', () => {
  h.state.uncertain = true;
  const tree = render();
  for (const id of ['notification-email', 'notification-language-en', 'notification-save'])
    expect(find(tree, 'testID', id).props.disabled).toBe(true);
  expect(find(tree, 'testID', 'notification-read').props.label).toBe('checkResult');
  expect(nodes(tree).some((n) => n.props.children === 'notificationSaved')).toBe(false);
  (find(tree, 'testID', 'notification-read').props.onPress as () => void)();
  expect(h.read).toHaveBeenCalledTimes(2);
});
it('read errors show no fabricated form, retry is available and offline actions are disabled', () => {
  h.state.preferences = undefined;
  h.state.draft = undefined;
  h.state.error = new ApiError('NETWORK');
  const tree = render();
  expect(nodes(tree).some((n) => n.props.testID === 'notification-save')).toBe(false);
  expect(find(tree, 'testID', 'notification-read').props.label).toBe('retry');
  h.online = false;
  expect(find(render(), 'testID', 'notification-read').props.disabled).toBe(true);
});
it('remounts preferences for every login generation and excludes local and signed-out access', () => {
  const first = NotificationsScreen()!;
  h.version++;
  expect(NotificationsScreen()!.key).not.toBe(first.key);
  h.status = 'local';
  expect(NotificationsScreen()).toBeNull();
  h.status = 'signedOut';
  expect(NotificationsScreen()).toBeNull();
});
