import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { EmailScreen } from './EmailScreen';
const h = vi.hoisted(() => ({
  state: {
    profile: {
      id: 'a'.repeat(24),
      username: 'alice',
      displayName: 'Alice',
      email: 'old@example.com',
    },
    email: 'new@example.com',
    code: '123456',
    stage: 'verify',
    busy: false,
    uncertain: false,
    sendUntil: 0,
    verifyUntil: 0,
    result: '',
    error: undefined as unknown,
  },
  online: true,
  status: 'signedIn',
  version: 1,
  edit: vi.fn(),
  send: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  read: vi.fn(),
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
vi.mock('./EmailChanger', () => ({
  EmailChanger: class {
    getSnapshot = () => h.state;
    subscribe = vi.fn();
    dispose = vi.fn();
    edit = h.edit;
    send = h.send;
    confirm = h.confirm;
    cancel = h.cancel;
    read = h.read;
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
  Object.fromEntries(
    ['Action', 'Card', 'Copy', 'DetailRow', 'Notice', 'TextField'].map((x) => [x, x])
  )
);
vi.mock('@/i18n/useMessages', () => ({
  useAppLocale: () => 'en',
  useMessages: () => new Proxy({}, { get: (_o, k) => String(k) }),
}));
type Element = ReactElement<Record<string, unknown>>;
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const e = node as Element;
  return [e, ...nodes(e.props.children as ReactNode)];
}
const render = () => (EmailScreen()!.type as () => ReactElement)();
const find = (tree: ReactNode, id: string) => nodes(tree).find((n) => n.props.testID === id)!;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.online = true;
  h.status = 'signedIn';
  h.state.stage = 'verify';
  h.state.email = 'new@example.com';
  h.state.code = '123456';
  h.state.busy = false;
  h.state.uncertain = false;
  h.state.sendUntil = 0;
  h.state.verifyUntil = 0;
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
it('shows private current email and target-bound code with iOS autofill; send waiting does not disable confirmation', () => {
  h.state.sendUntil = Date.now() + 120000;
  const tree = render();
  expect(find(tree, 'email-new').props.autoComplete).toBe('email');
  expect(find(tree, 'email-code').props.textContentType).toBe('oneTimeCode');
  expect(find(tree, 'email-send').props.disabled).toBe(true);
  expect(find(tree, 'email-confirm').props.disabled).toBe(false);
  (find(tree, 'email-confirm').props.onPress as () => void)();
  expect(h.confirm).toHaveBeenCalledOnce();
});
it('unknown and offline lock write actions but keep explicit result lookup visible', () => {
  h.state.uncertain = true;
  const tree = render();
  for (const id of ['email-send', 'email-confirm', 'email-cancel'])
    expect(find(tree, id).props.disabled).toBe(true);
  expect(find(tree, 'email-read').props.disabled).toBe(false);
  (find(tree, 'email-read').props.onPress as () => void)();
  expect(h.read).toHaveBeenCalled();
});
it('blocks leaving while busy and warns that leaving does not cancel sent codes', () => {
  render();
  const back = h.guard.mock.calls.at(-1)![1];
  back({ data: { action: 'BACK' } });
  expect(h.alert).toHaveBeenCalledWith('leaveFormTitle', 'emailChangeUnsaved', expect.any(Array));
  h.state.busy = true;
  back({ data: { action: 'BACK' } });
  expect(h.dispatch).not.toHaveBeenCalled();
});
it('rekeys by login epoch and never exposes a local or signed-out account', () => {
  const first = EmailScreen()!;
  h.version++;
  expect(EmailScreen()!.key).not.toBe(first.key);
  h.status = 'local';
  expect(EmailScreen()).toBeNull();
  h.status = 'signedOut';
  expect(EmailScreen()).toBeNull();
});

it('a reopened empty form can explicitly invalidate previously sent codes without entering an email again', () => {
  h.state.stage = 'edit';
  h.state.email = '';
  h.state.code = '';
  const tree = render();
  expect(find(tree, 'email-cancel').props.disabled).toBe(false);
  (find(tree, 'email-cancel').props.onPress as () => void)();
  expect(h.cancel).toHaveBeenCalledOnce();
  expect(h.send).not.toHaveBeenCalled();
  expect(h.confirm).not.toHaveBeenCalled();
});
