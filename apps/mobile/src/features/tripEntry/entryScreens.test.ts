import { beforeEach, expect, it, vi, afterEach } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { ApiError } from '@/api/client';
import { messages } from '@/i18n/messages';
import { TripFormScreen } from './TripFormScreen';
import { InvitationScreen } from './InvitationScreen';

const h = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  i: 0,
  j: 0,
  effects: [] as (() => void | (() => void))[],
  background: (() => undefined) as (state: string) => void,
  locale: 'en' as keyof typeof messages,
  online: true,
  visible: true,
  focused: true,
  account: 'a'.repeat(24),
  version: 1,
  access: 1,
  confirm: vi.fn(),
  request: vi.fn(),
  goBack: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  dismissTo: vi.fn(),
  copy: vi.fn(),
  share: vi.fn(),
  dismiss: vi.fn(),
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
  useEffect: (fn: () => void | (() => void)) => {
    h.effects.push(fn);
  },
}));
vi.mock('react-native', () => ({
  TextInput: 'TextInput',
  Alert: { alert: vi.fn() },
  Keyboard: { dismiss: h.dismiss },
  AppState: {
    addEventListener: (_name: string, fn: (state: string) => void) => {
      h.background = fn;
      return { remove: vi.fn() };
    },
  },
  Share: { share: h.share },
}));
vi.mock('expo-clipboard', () => ({ setStringAsync: h.copy }));
vi.mock('expo-router', () => ({
  router: { push: h.push, replace: h.replace, dismissTo: h.dismissTo },
  useNavigation: () => ({ isFocused: () => h.focused, dispatch: vi.fn() }),
}));
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: vi.fn() }));
vi.mock('@/components/screen', () => ({ FormPage: 'FormPage', PageHeader: 'PageHeader' }));
vi.mock('@/components/navigation', () => ({ goBack: h.goBack }));
vi.mock('@/features/navigation/TripContext', () => ({ TripContext: 'TripContext' }));
vi.mock('@/components/ui', () =>
  Object.fromEntries(
    ['Action', 'Card', 'Copy', 'DetailRow', 'Notice', 'Page', 'TextField'].map((n) => [n, n])
  )
);
vi.mock('@/i18n/useMessages', async () => {
  const { messages } = await import('@/i18n/messages');
  return { useMessages: () => messages[h.locale] };
});
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
const manager = {
  api: { baseUrl: 'https://test/api/v1' },
  getSignInVersion: () => h.version,
  requestAs: h.request,
};
vi.mock('./provider', () => ({
  useTripEntry: () => ({
    entry: { confirm: h.confirm },
    scope: { environment: 'https://test/api/v1', accountId: h.account },
    manager,
  }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: h.account }, manager }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({
    catalog: { isVisible: () => h.visible, accessVersion: () => h.access, deny: vi.fn() },
  }),
}));

type Element = ReactElement<Record<string, unknown>>;
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const e = node as Element;
  return [e, ...nodes(e.props.children as ReactNode)];
}
let mode: 'create' | 'join' | 'invitation' = 'create';
function render() {
  h.i = h.j = 0;
  h.effects = [];
  return mode === 'invitation' ? InvitationScreen({ id: 'trip' }) : TripFormScreen({ mode });
}
function find(id: string) {
  const found = nodes(render()).find((n) => n.props.testID === id);
  if (!found) throw new Error(`Missing ${id}`);
  return found;
}
function edit(id: string, value: string) {
  (find(id).props.onChangeText as (v: string) => void)(value);
}
function press(id: string) {
  (find(id).props.onPress as () => void)();
}
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
const invitation = { code: 'ABC123', url: 'https://test/join/ABC123' };
async function openInvitation() {
  mode = 'invitation';
  render();
  const dispose = h.effects[0]();
  await flush();
  return dispose;
}
beforeEach(() => {
  vi.clearAllMocks();
  h.values = [];
  h.refs = [];
  h.effects = [];
  h.i = h.j = 0;
  h.locale = 'en';
  h.online = h.visible = h.focused = true;
  h.account = 'a'.repeat(24);
  h.version = h.access = 1;
  mode = 'create';
  h.confirm.mockReset().mockResolvedValue({ kind: 'not-sent', error: new ApiError('NETWORK') });
  h.request.mockReset().mockResolvedValue(invitation);
  h.copy.mockReset().mockResolvedValue(undefined);
  h.share.mockReset().mockResolvedValue({ action: 'sharedAction' });
});
afterEach(() => vi.useRealTimers());
it.each(Object.keys(messages) as (keyof typeof messages)[])(
  'trip keyboard order and labeled invitation use locale %s',
  async (locale) => {
    h.locale = locale;
    const focus = vi.fn();
    for (const [id, next] of [
      ['trip-name', 'trip-description'],
      ['trip-description', 'trip-start'],
      ['trip-start', 'trip-end'],
    ]) {
      (find(next).props.inputRef as { current: unknown }).current = { focus };
      (find(id).props.onSubmitEditing as () => void)();
    }
    expect(focus).toHaveBeenCalledTimes(3);
    expect(find('trip-description').props).toMatchObject({
      multiline: true,
      submitBehavior: 'submit',
    });
    expect(find('trip-start').props.placeholder).toBe(messages[locale].dateFormatHint);
    (find('trip-end').props.onSubmitEditing as () => void)();
    expect(h.dismiss).toHaveBeenCalledOnce();
    h.values = [];
    h.refs = [];
    await openInvitation();
    expect(find('invitation-code').props).toMatchObject({
      label: messages[locale].invitationCode,
      value: invitation.code,
    });
    expect(find('invitation-link').props).toMatchObject({
      label: messages[locale].invitationLink,
      value: invitation.url,
    });
    const header = nodes(render()).find((n) => n.type === 'PageHeader')!;
    expect(header.props.backLabel).toBe(messages[locale].backToTrip);
    expect(find('invitation-share').props.variant).toBe('secondary');
  }
);
it('invalid trip focuses the failed date without sending; submitted date-only values remain exact', async () => {
  edit('trip-name', 'Trip');
  edit('trip-start', '2026-02-30');
  const focus = vi.fn();
  (find('trip-start').props.inputRef as { current: unknown }).current = { focus };
  press('trip-confirm');
  await flush();
  expect(h.confirm).not.toHaveBeenCalled();
  expect(focus).toHaveBeenCalledOnce();
  edit('trip-start', '2026-10-08');
  edit('trip-end', '2026-10-09');
  edit('trip-description', 'TEST description');
  press('trip-confirm');
  await flush();
  expect(h.confirm.mock.calls[0][1]).toEqual({
    operation: 'trip.create',
    body: {
      name: 'Trip',
      description: 'TEST description',
      start_date: '2026-10-08',
      end_date: '2026-10-09',
    },
  });
  expect(find('trip-start').props.value).toBe('2026-10-08');
});
it('join parses explicit invitation and duplicate taps share one engine confirmation', async () => {
  mode = 'join';
  let resolve!: (value: unknown) => void;
  h.confirm.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  edit('trip-invite', 'ABC123');
  const submit = find('trip-confirm').props.onPress as () => void;
  submit();
  submit();
  expect(h.confirm).toHaveBeenCalledOnce();
  expect(h.confirm.mock.calls[0][1]).toEqual({
    operation: 'trip.join',
    body: { invite_code: 'abc123' },
  });
  resolve({ kind: 'not-sent', error: new ApiError('NETWORK') });
  await flush();
  expect(find('trip-invite').props.value).toBe('ABC123');
});
it.each(['pending', 'completed'])(
  'confirmed %s navigates to original recovery/trip and locks form',
  async (kind) => {
    vi.useFakeTimers();
    edit('trip-name', 'Trip');
    h.confirm.mockResolvedValue(
      kind === 'pending' ? { kind } : { kind, result: { status: 'committed', resourceId: 'trip' } }
    );
    press('trip-confirm');
    await flush();
    vi.runAllTimers();
    expect(find('trip-confirm').props.disabled).toBe(true);
    if (kind === 'pending') expect(h.replace).toHaveBeenCalledWith('/trips/operations');
    else
      expect(h.dismissTo).toHaveBeenCalledWith({ pathname: '/trips/[id]', params: { id: 'trip' } });
  }
);
it('offline join disables submission and rejects malformed input before calling the engine', async () => {
  mode = 'join';
  h.online = false;
  expect(find('trip-confirm').props.disabled).toBe(true);
  h.online = true;
  edit('trip-invite', 'wrong!');
  press('trip-confirm');
  await flush();
  expect(h.confirm).not.toHaveBeenCalled();
  expect(nodes(render()).some((n) => n.props.children === messages.en.invalidInvite)).toBe(true);
});
it('invitation copies/shares only visible data and reports failure outside the details', async () => {
  await openInvitation();
  press('invitation-copy');
  await flush();
  expect(h.copy).toHaveBeenCalledExactlyOnceWith(invitation.url);
  expect(
    nodes(render()).some(
      (n) => n.props.children === messages.en.copiedInvitation && n.props.tone === 'success'
    )
  ).toBe(true);
  press('invitation-share');
  await flush();
  expect(h.share).toHaveBeenCalledWith({ message: invitation.url, url: invitation.url });
  h.copy.mockRejectedValue(new Error('clipboard'));
  press('invitation-copy');
  await flush();
  expect(
    nodes(render()).some(
      (n) => n.props.children === messages.en.copyFailed && n.props.tone === 'danger'
    )
  ).toBe(true);
});
it.each(['account', 'background', 'access', 'offline'])(
  'invitation hides its code and actions after %s changes',
  async (change) => {
    await openInvitation();
    const oldAction = find('invitation-copy').props.onPress as () => void;
    if (change === 'account') {
      h.account = 'b'.repeat(24);
      h.version++;
    }
    if (change === 'background') h.background('background');
    if (change === 'access') {
      h.access++;
      h.visible = false;
    }
    if (change === 'offline') h.online = false;
    expect(
      nodes(render()).some(
        (n) => n.props.testID === 'invitation-details' || n.props.testID === 'invitation-copy'
      )
    ).toBe(false);
    if (change === 'account' || change === 'access') {
      oldAction();
      await flush();
      expect(h.copy).not.toHaveBeenCalled();
    }
  }
);
it('late invitation response after leaving is ignored; retry remains read-only', async () => {
  let resolve!: (value: unknown) => void;
  h.request.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const dispose = await openInvitation();
  if (typeof dispose === 'function') dispose();
  resolve(invitation);
  await flush();
  expect(nodes(render()).some((n) => n.props.testID === 'invitation-code')).toBe(false);
  press('invitation-refresh');
  expect(h.confirm).not.toHaveBeenCalled();
});
