import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { ApiClient, type Fetcher } from '@/api/client';
import { messages } from '@/i18n/messages';
import { LoginScreen } from './LoginScreen';
import { AccountScreen } from './AccountScreen';

const h = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  i: 0,
  j: 0,
  locale: 'en' as keyof typeof messages,
  os: 'ios',
  params: {} as { username?: string; notice?: string },
  login: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  goBack: vi.fn(),
  dismiss: vi.fn(),
  fetcher: vi.fn<Fetcher>(),
  api: undefined as unknown as ApiClient,
  focused: true,
  focus: (() => undefined) as () => unknown,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.i++;
    if (!(i in h.values)) h.values[i] = typeof initial === 'function' ? initial() : initial;
    return [
      h.values[i],
      (v: unknown) => {
        h.values[i] = typeof v === 'function' ? v(h.values[i]) : v;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.j++] ??= { current: initial }),
  useId: () => 'account-test',
  useCallback: (fn: unknown) => fn,
  useEffect: () => undefined,
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock('react-native', () => ({
  ...Object.fromEntries(
    ['TextInput', 'KeyboardAvoidingView', 'InputAccessoryView', 'Pressable', 'Text', 'View'].map(
      (n) => [n, n]
    )
  ),
  Keyboard: { dismiss: h.dismiss },
  Alert: { alert: vi.fn() },
  Platform: {
    get OS() {
      return h.os;
    },
  },
}));
vi.mock('expo-router', () => ({
  router: { push: h.push, replace: h.replace },
  useLocalSearchParams: () => h.params,
  useFocusEffect: (fn: () => unknown) => {
    h.focus = fn;
  },
  useNavigation: () => ({ isFocused: () => h.focused, dispatch: vi.fn() }),
}));
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: vi.fn() }));
vi.mock('@/components/navigation', () => ({ goBack: h.goBack }));
vi.mock('@/components/screen', () => ({ FormPage: 'FormPage' }));
vi.mock('@/components/ui', async () => {
  const { colors } = await import('@/theme/tokens');
  return {
    ...Object.fromEntries(
      ['Action', 'Card', 'Copy', 'Notice', 'Page', 'TextField', 'Title'].map((n) => [n, n])
    ),
    usePalette: () => colors.light,
  };
});
vi.mock('@/i18n/useMessages', async () => {
  const { messages } = await import('@/i18n/messages');
  return { useMessages: () => messages[h.locale], useAppLocale: () => h.locale };
});
vi.mock('./AuthProvider', () => ({ useAuth: () => ({ manager: { api: h.api, login: h.login } }) }));

type Element = ReactElement<Record<string, unknown>>;
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const e = node as Element;
  return [e, ...nodes(e.props.children as ReactNode)];
}
let mode: 'login' | 'register' | 'request' = 'login';
function render() {
  h.i = h.j = 0;
  return mode === 'login' ? LoginScreen() : AccountScreen({ mode });
}
function find(id: string) {
  const found = nodes(render()).find((n) => n.props.testID === id);
  if (!found) throw new Error(`Missing ${id}`);
  return found;
}
function edit(id: string, text: string) {
  (find(id).props.onChangeText as (text: string) => void)(text);
}
function press(id: string) {
  (find(id).props.onPress as () => void)();
}
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
const user = { id: '1'.repeat(24), username: 'Tester', displayName: 'Test' };
beforeEach(() => {
  vi.clearAllMocks();
  h.values = [];
  h.refs = [];
  h.i = h.j = 0;
  h.locale = 'en';
  h.os = 'ios';
  h.params = {};
  h.focused = true;
  mode = 'login';
  h.login.mockReset().mockResolvedValue(undefined);
  h.fetcher.mockReset().mockImplementation(async (url) =>
    Response.json({
      data: url.endsWith('/auth/register')
        ? user
        : url.endsWith('/request')
          ? { accepted: true }
          : { reset: true },
    })
  );
  h.api = new ApiClient('https://test/api/v1', h.fetcher);
});
afterEach(() => vi.useRealTimers());
it.each(Object.keys(messages) as (keyof typeof messages)[])(
  'login uses shared native fields and localized labels: %s',
  (locale) => {
    h.locale = locale;
    expect(find('login-username').type).toBe('TextField');
    expect(find('login-username').props).toMatchObject({
      label: messages[locale].username,
      autoComplete: 'username',
      textContentType: 'username',
      returnKeyType: 'next',
    });
    expect(find('login-password').props).toMatchObject({
      label: messages[locale].password,
      secureTextEntry: true,
      autoComplete: 'current-password',
      textContentType: 'password',
      returnKeyType: 'go',
    });
    expect(nodes(render()).some((n) => n.type === 'Page' && n.props.form === true)).toBe(true);
    expect(nodes(render()).some((n) => n.props.children === messages[locale].subtitle)).toBe(false);
  }
);
it('login keyboard chain and double tap preserve raw password and clear it only after success', async () => {
  let complete!: () => void;
  h.login.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      })
  );
  edit('login-username', ' Tester ');
  edit('login-password', ' password with spaces ');
  const focus = vi.fn();
  (find('login-password').props.inputRef as { current: unknown }).current = { focus };
  (find('login-username').props.onSubmitEditing as () => void)();
  expect(focus).toHaveBeenCalledOnce();
  const submit = find('login-submit').props.onPress as () => void;
  submit();
  submit();
  await flush();
  expect(h.login).toHaveBeenCalledExactlyOnceWith('Tester', ' password with spaces ');
  expect(find('login-password').props.editable).toBe(false);
  complete();
  await flush();
  expect(find('login-password').props.value).toBe('');
});
it('required input and failed login keep the error visible without clearing retry input', async () => {
  press('login-submit');
  await flush();
  expect(h.login).not.toHaveBeenCalled();
  expect(nodes(render()).some((n) => n.props.children === messages.en.required)).toBe(true);
  edit('login-username', 'Tester');
  edit('login-password', 'secret');
  h.login.mockRejectedValue(new Error('Failure'));
  press('login-submit');
  await flush();
  expect(find('login-password').props.value).toBe('secret');
  expect(nodes(render()).some((n) => n.type === 'Notice' && n.props.tone === 'danger')).toBe(true);
});
it.each([
  ['login-register', '/register'],
  ['login-forgot', '/password-reset'],
])('clears password before %s navigation', (id, path) => {
  edit('login-password', 'secret');
  press(id);
  expect(find('login-password').props.value).toBe('');
  expect(h.push).toHaveBeenCalledWith(path);
});
it('native-only login and reset cannot write from web', async () => {
  h.os = 'web';
  edit('login-username', 'Tester');
  edit('login-password', 'secret');
  expect(find('login-submit').props.disabled).toBe(true);
  press('login-submit');
  await flush();
  expect(h.login).not.toHaveBeenCalled();
  h.values = [];
  h.refs = [];
  mode = 'request';
  render();
  edit('account-email', 'test@example.com');
  expect(find('account-submit').props.disabled).toBe(true);
  press('account-submit');
  await flush();
  expect(h.fetcher).not.toHaveBeenCalled();
});
it('registration uses inline password rules, returns to login and never creates a session', async () => {
  mode = 'register';
  render();
  h.focus();
  for (const [key, value] of Object.entries({
    username: 'Tester',
    display_name: 'Test',
    email: 'test@example.com',
    password: 'secret123',
    confirmation: 'secret123',
  }))
    edit(`account-${key}`, value);
  expect(find('account-password').props.description).toBe(messages.en.newPasswordHint);
  press('account-submit');
  await flush();
  expect(h.replace).toHaveBeenCalledWith({
    pathname: '/',
    params: { username: 'Tester', notice: 'registered' },
  });
  expect(h.login).not.toHaveBeenCalled();
  expect(JSON.parse(String(h.fetcher.mock.calls[0][1]!.body))).not.toHaveProperty('confirmation');
});
it('leading-zero reset code moves to password without submitting; reset confirms explicitly', async () => {
  mode = 'request';
  render();
  h.focus();
  edit('account-email', 'test@example.com');
  press('account-have-code');
  edit('account-code', '001234');
  edit('account-password', 'secret123');
  edit('account-confirmation', 'secret123');
  expect((render() as Element).props.title).toBe(messages.en.resetPassword);
  expect(find('account-code').props).toMatchObject({
    keyboardType: 'number-pad',
    autoComplete: 'one-time-code',
    textContentType: 'oneTimeCode',
    maxLength: 6,
  });
  const focus = vi.fn();
  (find('account-password').props.inputRef as (ref: unknown) => void)({ focus });
  press('account-code-next');
  expect(focus).toHaveBeenCalledOnce();
  expect(h.fetcher).not.toHaveBeenCalled();
  expect(
    (find('account-code-next').props.style as { minHeight: number }).minHeight
  ).toBeGreaterThanOrEqual(48);
  press('account-submit');
  await flush();
  expect(JSON.parse(String(h.fetcher.mock.calls[0][1]!.body)).code).toBe('001234');
  expect(h.replace).toHaveBeenCalledWith({
    pathname: '/',
    params: { username: '', notice: 'passwordResetDone' },
  });
});
it('send-code 429 disables resend while confirmation stays available, without resetting its deadline', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T00:00:00Z'));
  mode = 'request';
  render();
  h.focus();
  edit('account-email', 'test@example.com');
  press('account-have-code');
  h.fetcher.mockResolvedValue(
    Response.json(
      { error: { code: 'RATE_LIMITED' } },
      { status: 429, headers: { 'retry-after': '120' } }
    )
  );
  press('account-resend');
  await flush();
  expect(find('account-resend').props.disabled).toBe(true);
  expect(find('account-submit').props.disabled).toBe(false);
  const deadline = Date.now() + 120000;
  render();
  expect(
    (h.values[0] as { getSnapshot: () => { retryAt: { request: number } } }).getSnapshot().retryAt
      .request
  ).toBe(deadline);
  expect(nodes(render()).some((n) => n.type === 'Notice' && n.props.announce === 'none')).toBe(
    true
  );
});
it('verification 429 disables confirm independently and a mismatch focuses confirmation without HTTP', async () => {
  mode = 'request';
  render();
  h.focus();
  edit('account-email', 'test@example.com');
  press('account-have-code');
  edit('account-code', '001234');
  edit('account-password', 'secret123');
  edit('account-confirmation', 'wrong');
  const focus = vi.fn();
  (find('account-confirmation').props.inputRef as (ref: unknown) => void)({ focus });
  press('account-submit');
  await flush();
  expect(focus).toHaveBeenCalledOnce();
  expect(h.fetcher).not.toHaveBeenCalled();
  edit('account-confirmation', 'secret123');
  h.fetcher.mockResolvedValue(
    Response.json(
      { error: { code: 'RATE_LIMITED' } },
      { status: 429, headers: { 'retry-after': '60' } }
    )
  );
  press('account-submit');
  await flush();
  expect(find('account-submit').props.disabled).toBe(true);
  expect(find('account-resend').props.disabled).toBe(false);
});
