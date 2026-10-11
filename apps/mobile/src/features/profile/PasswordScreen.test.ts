import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { PasswordScreen } from './PasswordScreen';
const h = vi.hoisted(() => ({
  state: {
    current: '',
    password: '',
    confirmation: '',
    busy: false,
    uncertain: false,
    ending: false,
    error: undefined as unknown,
  },
  online: true,
  status: 'signedIn',
  version: 1,
  edit: vi.fn(),
  submit: vi.fn(),
  reauthenticate: vi.fn(),
  guard: vi.fn(),
  dispatch: vi.fn(),
  alert: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (v: unknown) => [typeof v === 'function' ? (v as () => unknown)() : v, vi.fn()],
  useRef: (v: unknown) => ({ current: v }),
  useEffect: (effect: () => void) => effect(),
  useSyncExternalStore: (_s: unknown, read: () => unknown) => read(),
}));
vi.mock('./PasswordChanger', () => ({
  PasswordChanger: class {
    getSnapshot = () => h.state;
    subscribe = vi.fn();
    dispose = vi.fn();
    edit = h.edit;
    submit = h.submit;
    reauthenticate = h.reauthenticate;
  },
}));
vi.mock('react-native', () => ({
  Alert: { alert: h.alert },
  AppState: { currentState: 'active' },
}));
vi.mock('expo-router', () => ({
  router: { replace: h.replace },
  useNavigation: () => ({ dispatch: h.dispatch }),
}));
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: h.guard }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: h.status,
    user: { id: 'a'.repeat(24), username: 'alice' },
    manager: { api: { environment: 'https://example.invalid' }, getSignInVersion: () => h.version },
  }),
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('@/components/screen', () => ({ FormPage: 'FormPage' }));
vi.mock('@/components/navigation', () => ({ goBack: vi.fn() }));
vi.mock('@/components/ui', () =>
  Object.fromEntries(['Action', 'Card', 'Copy', 'Notice', 'TextField'].map((x) => [x, x]))
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
const render = () => (PasswordScreen()!.type as () => ReactElement)();
const find = (tree: ReactNode, id: string) => nodes(tree).find((n) => n.props.testID === id)!;
beforeEach(() => {
  vi.clearAllMocks();
  h.online = true;
  h.status = 'signedIn';
  h.version = 1;
  h.state = {
    current: 'old',
    password: 'new123',
    confirmation: 'new123',
    busy: false,
    uncertain: false,
    ending: false,
    error: undefined,
  };
  h.submit.mockResolvedValue(false);
});
it('uses secure keyboard fields and next/next/done; explicit confirmation routes to login after success', async () => {
  const tree = render();
  for (const id of ['password-current', 'password-new', 'password-confirm'])
    expect(find(tree, id).props.secureTextEntry).toBe(true);
  expect(find(tree, 'password-current').props.returnKeyType).toBe('next');
  expect(find(tree, 'password-new').props.autoComplete).toBe('new-password');
  expect(find(tree, 'password-confirm').props.returnKeyType).toBe('done');
  h.submit.mockResolvedValue(true);
  (find(tree, 'password-save').props.onPress as () => void)();
  await vi.waitFor(() =>
    expect(h.replace).toHaveBeenCalledWith({
      pathname: '/',
      params: { notice: 'passwordChanged', username: 'alice' },
    })
  );
});
it('uncertainty locks input and exposes manual login; offline blocks submission', () => {
  h.state.uncertain = true;
  h.online = false;
  const tree = render();
  expect(find(tree, 'password-save').props.disabled).toBe(true);
  expect(find(tree, 'password-current').props.editable).toBe(false);
  expect(find(tree, 'password-login')).toBeDefined();
  expect(nodes(tree).some((n) => n.props.children === 'passwordChangeUnknown')).toBe(true);
});
it('guards dirty/busy navigation but permits intentional credential-session exit', () => {
  render();
  expect(h.guard.mock.calls.at(-1)?.[0]).toBe(true);
  const back = h.guard.mock.calls.at(-1)![1];
  back({ data: { action: 'BACK' } });
  expect(h.alert).toHaveBeenCalledOnce();
  h.state.busy = true;
  back({ data: { action: 'BACK' } });
  expect(h.dispatch).not.toHaveBeenCalled();
  h.state.ending = true;
  back({ data: { action: 'EXIT' } });
  expect(h.dispatch).toHaveBeenCalledWith('EXIT');
});
it('rekeys form for login changes and excludes local/signed-out access', () => {
  const first = PasswordScreen()!;
  h.version++;
  expect(PasswordScreen()!.key).not.toBe(first.key);
  h.status = 'local';
  expect(PasswordScreen()).toBeNull();
  h.status = 'signedOut';
  expect(PasswordScreen()).toBeNull();
});
