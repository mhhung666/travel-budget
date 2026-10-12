import { beforeEach, expect, it, vi, afterEach } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { Alert } from 'react-native';
import { ApiError } from '@/api/client';
import { messages } from '@/i18n/messages';
import { TripFormScreen } from './TripFormScreen';
import { InvitationScreen } from './InvitationScreen';
const h = vi.hoisted(() => ({
  environment: 'https://test/api/v1',
  status: 'signedIn',
  caps: {
    data: { nonTwdCreationEnabled: false, supportedBaseCurrencies: ['TWD'] } as
      { nonTwdCreationEnabled: boolean; supportedBaseCurrencies: string[] } | undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  records: {
    data: [] as
      | {
          operation: string;
          status: string;
          payload?: { operation: string; body: Record<string, unknown> };
          baseCurrency?: string;
          clientRequestId?: string;
        }[]
      | undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  query: undefined as
    | undefined
    | {
        queryKey: unknown[];
        enabled: boolean;
        queryFn: (args: { signal?: AbortSignal }) => Promise<unknown>;
      },
  prevent: false,
  leave: undefined as undefined | ((args: { data: { action: unknown } }) => void),
  dispatch: vi.fn(),
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
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: typeof h.query) => {
    h.query = options;
    return h.caps;
  },
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
  useLayoutEffect: (fn: () => void) => fn(),
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
  useNavigation: () => ({ isFocused: () => h.focused, dispatch: h.dispatch }),
}));
vi.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (prevent: boolean, leave: typeof h.leave) => {
    h.prevent = prevent;
    h.leave = leave;
  },
}));
vi.mock('@/components/screen', () => ({ FormPage: 'FormPage', PageHeader: 'PageHeader' }));
vi.mock('@/components/navigation', () => ({ goBack: h.goBack }));
vi.mock('@/features/navigation/TripContext', () => ({ TripContext: 'TripContext' }));
vi.mock('@/components/ui', () =>
  Object.fromEntries(
    ['Chip', 'Action', 'Card', 'Copy', 'DetailRow', 'Notice', 'Page', 'TextField'].map((n) => [
      n,
      n,
    ])
  )
);
vi.mock('@/i18n/useMessages', async () => {
  const { messages } = await import('@/i18n/messages');
  return { useMessages: () => messages[h.locale], useAppLocale: () => h.locale };
});
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
const manager = {
  api: {
    get environment() {
      return h.environment;
    },
  },
  getSnapshot: () => ({ status: h.status, user: { id: h.account } }),
  getSignInVersion: () => h.version,
  requestAs: h.request,
};
vi.mock('./BaseCurrencyField', () => ({ BaseCurrencyField: 'BaseCurrencyField' }));
vi.mock('./provider', () => ({
  useTripEntry: () => ({
    entry: { confirm: h.confirm },
    scope: { environment: h.environment, accountId: h.account },
    records: h.records,
    manager,
  }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: h.account }, manager, status: h.status }),
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
let formKey: string | null = null;
function render() {
  h.i = h.j = 0;
  h.effects = [];
  if (mode === 'invitation') return InvitationScreen({ id: 'trip' });
  const element = TripFormScreen({ mode });
  if (!element) return null;
  if (formKey !== element.key) {
    h.values = [];
    h.refs = [];
    formKey = element.key;
  }
  return (element.type as (props: { mode: 'create' | 'join' }) => ReactNode)(element.props);
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
  formKey = null;
  h.environment = 'https://test/api/v1';
  h.status = 'signedIn';
  h.caps = {
    data: { nonTwdCreationEnabled: false, supportedBaseCurrencies: ['TWD'] },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  };
  h.records = { data: [], isPending: false, isError: false, isFetching: false, refetch: vi.fn() };
  h.query = undefined;
  h.prevent = false;
  h.leave = undefined;
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
      base_currency: 'TWD',
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

it('places the base field after the name and keeps the picker controlled without submitting on selection', async () => {
  const tree = nodes(render());
  const field = tree.find((n) => n.type === 'BaseCurrencyField')!;
  expect(tree.findIndex((n) => n.props.testID === 'trip-name')).toBeLessThan(tree.indexOf(field));
  expect(field.props).toMatchObject({ value: 'TWD', codes: ['TWD'], open: false });
  (field.props.onOpenChange as (value: boolean) => void)(true);
  expect(find('trip-confirm').props.disabled).toBe(true);
  press('trip-confirm');
  await flush();
  expect(h.confirm).not.toHaveBeenCalled();
  (field.props.onOpenChange as (value: boolean) => void)(false);
  edit('trip-name', 'Trip');
  press('trip-confirm');
  await flush();
  expect(h.confirm.mock.calls[0][1].body).toMatchObject({ name: 'Trip', base_currency: 'TWD' });
});

function currencyField() {
  return nodes(render()).find((n) => n.type === 'BaseCurrencyField')!;
}
function selectBase(code: string) {
  (currencyField().props.onChange as (v: string) => void)(code);
}
function enabledCurrencies() {
  h.caps.data = { nonTwdCreationEnabled: true, supportedBaseCurrencies: ['TWD', 'USD', 'JPY'] };
}
it('currency-only changes prompt on leaving; same value and search-panel navigation do not make the form dirty', () => {
  enabledCurrencies();
  render();
  expect(h.prevent).toBe(false);
  selectBase('TWD');
  render();
  expect(h.prevent).toBe(false);
  (currencyField().props.onOpenChange as (v: boolean) => void)(true);
  render();
  h.leave!({ data: { action: 'back' } });
  expect(currencyField().props.open).toBe(false);
  expect(h.dispatch).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
  selectBase('USD');
  render();
  expect(h.prevent).toBe(true);
  h.leave!({ data: { action: 'back' } });
  expect(Alert.alert).toHaveBeenCalledOnce();
  const actions = vi.mocked(Alert.alert).mock.calls[0][2]!;
  actions[1].onPress!();
  expect(h.dispatch).toHaveBeenCalledWith('back');
});
it.each(['loading', 'refetch', 'error', 'offline', 'empty', 'withdrawn', 'closed-gate'])(
  'capability %s blocks both current and previously captured submit, retaining inputs and selected base',
  async (state) => {
    enabledCurrencies();
    edit('trip-name', 'Original');
    selectBase('USD');
    const oldSubmit = find('trip-confirm').props.onPress as () => void;
    if (state === 'loading') {
      h.caps.data = undefined;
      h.caps.isPending = true;
    }
    if (state === 'refetch') h.caps.isFetching = true;
    if (state === 'error') h.caps.isError = true;
    if (state === 'offline') h.online = false;
    if (state === 'empty') h.caps.data!.supportedBaseCurrencies = [];
    if (state === 'withdrawn') h.caps.data!.supportedBaseCurrencies = ['TWD'];
    if (state === 'closed-gate') h.caps.data!.nonTwdCreationEnabled = false;
    expect(find('trip-confirm').props.disabled).toBe(true);
    oldSubmit();
    press('trip-confirm');
    await flush();
    expect(h.confirm).not.toHaveBeenCalled();
    expect(find('trip-name').props.value).toBe('Original');
    expect(currencyField().props.value).toBe('USD');
    if (state === 'withdrawn' || state === 'closed-gate') {
      expect(currencyField().props.codes).toEqual(['TWD']);
      expect(currencyField().props.disabled).toBe(false);
      selectBase('TWD');
      press('trip-confirm');
      await flush();
      expect(h.confirm.mock.calls[0][1].body.base_currency).toBe('TWD');
    }
  }
);
it('capability retry is a guarded read and recovering capability enables the original inputs', async () => {
  enabledCurrencies();
  edit('trip-name', 'Original');
  selectBase('JPY');
  h.caps.isError = true;
  press('trip-currency-retry');
  expect(h.caps.refetch).toHaveBeenCalledOnce();
  expect(h.confirm).not.toHaveBeenCalled();
  h.caps.isError = false;
  press('trip-confirm');
  await flush();
  expect(h.confirm.mock.calls[0][1].body).toMatchObject({ name: 'Original', base_currency: 'JPY' });
});
it.each(['loading', 'error', 'refetch', 'pending'])(
  'local journal %s blocks a new UUID without blocking the existing recovery route',
  async (state) => {
    edit('trip-name', 'Original');
    if (state === 'loading') {
      h.records.data = undefined;
      h.records.isPending = true;
    }
    if (state === 'error') h.records.isError = true;
    if (state === 'refetch') h.records.isFetching = true;
    if (state === 'pending') h.records.data = [{ operation: 'trip.create', status: 'pending' }];
    expect(find('trip-confirm').props.disabled).toBe(true);
    press('trip-confirm');
    await flush();
    expect(h.confirm).not.toHaveBeenCalled();
    if (state === 'pending') expect(find('trip-name').props.editable).toBe(false);
    if (state === 'error') {
      press('trip-records-retry');
      expect(h.records.refetch).toHaveBeenCalledOnce();
    }
    const action = nodes(render()).find((n) => n.props.label === messages.en.pendingOperations)!;
    (action.props.onPress as () => void)();
    expect(h.push).toHaveBeenCalledWith('/trips/operations');
  }
);
it('an unrelated pending operation does not reserve trip creation; journal refusal remains terminal only in the engine', async () => {
  vi.useFakeTimers();
  h.records.data = [{ operation: 'trip.join', status: 'pending' }];
  edit('trip-name', 'Original');
  h.confirm.mockResolvedValue({ kind: 'completed', result: { status: 'rejected' } });
  press('trip-confirm');
  await flush();
  expect(h.confirm).toHaveBeenCalledOnce();
  expect(find('trip-name').props.editable).toBe(false);
});
it.each(['account', 'environment', 'same-account', 'logout'])(
  '%s change clears the old form and drops late capability, write error and navigation',
  async (change) => {
    enabledCurrencies();
    edit('trip-name', 'Private');
    selectBase('USD');
    const query = h.query!;
    const oldSubmit = find('trip-confirm').props.onPress as () => void;
    let resolveRead!: (value: unknown) => void, rejectWrite!: (reason: unknown) => void;
    h.request.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveRead = r;
        })
    );
    const read = query.queryFn({});
    const rejected = expect(read).rejects.toMatchObject({ code: 'CANCELLED' });
    h.confirm.mockImplementationOnce(
      () =>
        new Promise((_r, j) => {
          rejectWrite = j;
        })
    );
    oldSubmit();
    if (change === 'account') h.account = 'b'.repeat(24);
    if (change === 'environment') h.environment = 'https://other/api/v1';
    if (change === 'same-account') h.version++;
    if (change === 'logout') h.status = 'signedOut';
    if (change === 'logout') expect(render()).toBeNull();
    else {
      expect(find('trip-name').props.value).toBe('');
      expect(currencyField().props.value).toBe('TWD');
    }
    resolveRead({ nonTwdCreationEnabled: true, supportedBaseCurrencies: ['USD'] });
    await rejected;
    rejectWrite(new Error('private failure'));
    await flush();
    expect(h.dismissTo).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
    if (change !== 'logout')
      expect(nodes(render()).some((n) => n.props.children === 'private failure')).toBe(false);
    oldSubmit();
    expect(h.confirm).toHaveBeenCalledOnce();
  }
);
it('beforeSend rejects a replaced login even before rerender; the capability query is account/version-scoped', async () => {
  render();
  const query = h.query!;
  expect(query.queryKey).toEqual([h.environment, h.account, 'ledger-capabilities', 'v2', 1]);
  let beforeSend!: () => void;
  h.request.mockImplementationOnce(async (_id, _path, _schema, options) => {
    beforeSend = options.beforeSend;
    h.version++;
    beforeSend();
  });
  await expect(query.queryFn({})).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(beforeSend).toBeDefined();
});
it('unmount and busy guards stop stale field edits, exits, errors and navigation', async () => {
  enabledCurrencies();
  edit('trip-name', 'Original');
  selectBase('USD');
  const oldChange = find('trip-name').props.onChangeText as (v: string) => void;
  const oldSelect = currencyField().props.onChange as (v: string) => void;
  let resolve!: (value: unknown) => void;
  h.confirm.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  press('trip-confirm');
  oldChange('Overwrite');
  oldSelect('JPY');
  render();
  expect(find('trip-name').props.value).toBe('Original');
  expect(currencyField().props.value).toBe('USD');
  h.leave!({ data: { action: 'back' } });
  expect(Alert.alert).not.toHaveBeenCalled();
  const cleanup = h.effects[0]();
  if (typeof cleanup === 'function') cleanup();
  resolve({ kind: 'completed', result: { status: 'committed', resourceId: 'private' } });
  await flush();
  expect(h.dismissTo).not.toHaveBeenCalled();
  expect(h.replace).not.toHaveBeenCalled();
});

it('freezes a saved operation even while blurred and blocks an old submit before React rerenders', async () => {
  edit('trip-name', 'Original');
  const submit = find('trip-confirm').props.onPress as () => void;
  let resolve!: (value: unknown) => void;
  h.confirm.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  submit();
  h.focused = false;
  resolve({ kind: 'pending' });
  await flush();
  submit();
  expect(h.confirm).toHaveBeenCalledOnce();
  expect(find('trip-confirm').props.disabled).toBe(true);
  expect(find('trip-name').props.editable).toBe(false);
  await new Promise((r) => setTimeout(r, 5));
  expect(h.replace).not.toHaveBeenCalled();
});

it('reopened creation displays the original pending currency and body despite changed capabilities', () => {
  h.records.data = [
    {
      operation: 'trip.create',
      status: 'pending',
      clientRequestId: 'original-uuid',
      baseCurrency: 'USD',
      payload: {
        operation: 'trip.create',
        body: {
          name: 'Saved trip',
          description: 'Saved notes',
          start_date: '2026-10-10',
          end_date: null,
          base_currency: 'USD',
        },
      },
    },
  ];
  expect(find('trip-name').props).toMatchObject({ value: 'Saved trip', editable: false });
  expect(find('trip-description').props.value).toBe('Saved notes');
  expect(currencyField().props).toMatchObject({ value: 'USD', disabled: true });
  expect(
    nodes(render()).some(
      (n) => n.props.label === messages.en.requestId && n.props.value === 'original-uuid'
    )
  ).toBe(true);
  expect(nodes(render()).some((n) => n.props.testID === 'trip-currency-retry')).toBe(false);
});
