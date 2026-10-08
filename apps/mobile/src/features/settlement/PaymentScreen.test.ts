import { PaymentScreen } from './PaymentScreen';
import * as labelHelpers from './paymentLabels';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PaymentContext } from '@travel-budget/contracts';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  i: 0,
  j: 0,
  m: 0,
  memos: [] as { deps: unknown[]; value: unknown }[],
  focus: (() => undefined) as () => unknown,
  request: vi.fn(),
  confirm: vi.fn(),
  get: vi.fn(),
  dismiss: vi.fn(),
  refresh: vi.fn(),
  visible: true,
  online: true,
  scope: { environment: 'https://example/api/v1', accountId: '111111111111111111111111' },
  labels: new Proxy({}, { get: (_t, k) => String(k) }),
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
  useRef: (initial: unknown) => {
    const j = h.j++;
    return (h.refs[j] ??= { current: initial });
  },
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown, deps: unknown[]) => {
    const i = h.m++;
    if (!h.memos[i] || deps.some((v, n) => !Object.is(v, h.memos[i].deps[n])))
      h.memos[i] = { deps, value: fn() };
    return h.memos[i].value;
  },
  useEffect: () => undefined,
  useId: () => 'payment-test-accessory',
}));
vi.mock('@/features/expenses/useTripMembers', () => ({
  useTripMembers: () => ({ roster: undefined, denied: false }),
}));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  AppState: { currentState: 'active' },
  Keyboard: { dismiss: h.dismiss },
  Platform: { OS: 'ios' },
  TextInput: 'TextInput',
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  InputAccessoryView: 'InputAccessoryView',
}));
vi.mock('expo-router', () => ({
  router: { push: vi.fn(), dismissTo: vi.fn() },
  useFocusEffect: (fn: () => unknown) => {
    h.focus = fn;
  },
  useNavigation: () => ({ dispatch: vi.fn() }),
}));
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: vi.fn() }));
vi.mock('@/features/navigation/TripContext', () => ({ TripContext: 'TripContext' }));
vi.mock('@/components/ui', () => ({
  usePalette: () => ({ surface: 'white', border: 'gray', primary: 'teal' }),
  ...Object.fromEntries(
    [
      'Action',
      'Card',
      'Chip',
      'Copy',
      'DetailRow',
      'Notice',
      'Page',
      'Section',
      'TextField',
      'Title',
    ].map((k) => [k, k])
  ),
}));
vi.mock('@/features/tripEntry/provider', () => ({
  useTripEntry: () => ({
    scope: h.scope,
    entry: { confirm: h.confirm },
    manager: {
      getSignInVersion: () => 1,
      getSnapshot: () => ({ user: { id: h.scope.accountId } }),
      requestAs: h.request,
    },
  }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({
    catalog: {
      captureAccess: () => () => undefined,
      isVisible: () => h.visible,
      deny: vi.fn(),
    },
  }),
}));
vi.mock('@/i18n/useMessages', () => ({ useMessages: () => h.labels, useAppLocale: () => 'en' }));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('@/features/expenses/entryQueries', () => ({ refreshTripData: h.refresh }));
vi.mock('@/storage/pendingExpenseDatabase', () => ({
  openMutationStore: async () => ({
    retryAt: async () => 0,
    rateLimitUntil: () => 0,
    get: h.get,
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  onlineManager: { isOnline: () => true, subscribe: () => () => undefined },
  useQueryClient: () => ({}),
}));
const tripId = '222222222222222222222222',
  peerId = '333333333333333333333333';
const original: PaymentContext = {
  members: [
    { id: h.scope.accountId, displayName: 'Same' },
    { id: peerId, displayName: 'Same' },
  ],
  settlementRevision: 'a'.repeat(64),
  settlement: {
    status: 'outstanding',
    totalExpenses: 100,
    balances: [],
    payments: [],
    suggestedTransfers: [
      { fromId: peerId, toId: h.scope.accountId, fromName: 'Same', toName: 'Same', amount: 50 },
    ],
  },
};
let paymentId: string | undefined, source: string | undefined;
type NodeProps = {
  children?: unknown;
  testID?: string;
  title?: string;
  kind?: string;
  variant?: string;
  editable?: boolean;
  inputAccessoryViewID?: string;
  nativeID?: string;
  inputRef?: { current: unknown };
  style?: { minHeight?: number };
  onSubmitEditing?: () => void;
  label?: string;
  value?: string;
  disabled?: boolean;
  onPress?: () => void;
  onChangeText?: (value: string) => void;
};
function render() {
  h.i = h.j = h.m = 0;
  return PaymentScreen({
    tripId,
    paymentId,
    source,
    seed: { fromId: peerId, toId: h.scope.accountId, amountText: '50' },
  });
}
function nodes(node: unknown): { props: NodeProps }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as { props: NodeProps };
  return [element, ...nodes(element.props.children)];
}
function action(label: string) {
  const item = nodes(render()).find((n) => n.props.label === label && n.props.onPress);
  if (!item?.props.onPress) throw new Error(`Missing action ${label}`);
  return { ...item.props, onPress: item.props.onPress };
}
function input(label: string, value?: string) {
  const item = nodes(render()).find((n) => n.props.label === label && n.props.onChangeText);
  if (!item?.props.onChangeText) throw new Error(`Missing input ${label}`);
  if (value !== undefined) item.props.onChangeText(value);
  return item.props;
}
async function flush() {
  for (let i = 0; i < 25; i++) await Promise.resolve();
}
async function open() {
  render();
  h.focus();
  await flush();
}
beforeEach(() => {
  h.values = [];
  h.memos = [];
  h.refs = [];
  h.i = h.j = h.m = 0;
  paymentId = source = undefined;
  h.request.mockReset().mockResolvedValue(original);
  h.confirm.mockReset();
  h.get.mockReset();
  h.dismiss.mockReset();
  h.refresh.mockReset().mockResolvedValue(undefined);
  h.visible = h.online = true;
});
it('suggestion form confirms actual partial payment only once despite two immediate presses', async () => {
  await open();
  input('amountTwd', '20.01');
  input('paymentNote', ' paid externally ');
  action('confirmPayment').onPress();
  await flush();
  h.confirm.mockResolvedValue({ kind: 'not-sent' });
  const submit = action('recordPayment').onPress;
  submit();
  submit();
  await flush();
  expect(h.confirm).toHaveBeenCalledTimes(1);
  expect(h.confirm.mock.calls[0][1]).toEqual({
    operation: 'payment.create',
    tripId,
    body: {
      expected_revision: original.settlementRevision,
      from_id: peerId,
      to_id: h.scope.accountId,
      amount: 20.01,
      note: 'paid externally',
    },
  });
});
it.each(['context read', 'terminal refusal'])(
  'conflict at %s retains amount and note and requires explicit new confirmation',
  async (at) => {
    await open();
    input('amountTwd', '20.01');
    input('paymentNote', 'keep me');
    const latest = {
      ...original,
      settlementRevision: 'b'.repeat(64),
      settlement: { ...original.settlement, suggestedTransfers: [] },
    };
    if (at === 'context read') h.request.mockResolvedValue(latest);
    action('confirmPayment').onPress();
    await flush();
    if (at === 'terminal refusal') {
      h.request.mockResolvedValue(latest);
      h.confirm.mockResolvedValue({
        kind: 'completed',
        result: { status: 'rejected', code: 'SETTLEMENT_CHANGED' },
      });
      action('recordPayment').onPress();
      await flush();
      h.confirm.mockClear();
    }
    expect(input('amountTwd').value).toBe('20.01');
    action('reconfirmPayment').onPress();
    expect(h.confirm).not.toHaveBeenCalled();
    action('confirmPayment').onPress();
    await flush();
    h.confirm.mockResolvedValue({ kind: 'not-sent' });
    action('recordPayment').onPress();
    await flush();
    expect(h.confirm.mock.calls[0][1].body).toMatchObject({
      expected_revision: latest.settlementRevision,
      amount: 20.01,
      note: 'keep me',
    });
  }
);
it('rejected durable payment reopens its own input and prepares a fresh revision', async () => {
  source = '11111111-1111-4111-8111-111111111111';
  h.get.mockResolvedValue({
    status: 'completed',
    result: { status: 'rejected' },
    payload: {
      operation: 'payment.create',
      tripId,
      body: { from_id: h.scope.accountId, to_id: peerId, amount: 80, note: 'original note' },
    },
  });
  await open();
  expect(input('amountTwd').value).toBe('80');
  expect(input('paymentNote').value).toBe('original note');
  action('confirmPayment').onPress();
  await flush();
  h.confirm.mockResolvedValue({ kind: 'not-sent' });
  action('recordPayment').onPress();
  await flush();
  expect(h.confirm.mock.calls[0][1].body).toMatchObject({
    from_id: h.scope.accountId,
    to_id: peerId,
    amount: 80,
    expected_revision: original.settlementRevision,
  });
});
it('revocation cancellation writes nothing; changed raw identity is reviewed again before deletion', async () => {
  paymentId = tripId;
  const old = {
    payment: {
      id: paymentId,
      fromId: peerId,
      toId: h.scope.accountId,
      fromName: 'Old',
      toName: 'Same',
      amount: 20,
      note: '',
      createdAt: '2026-10-06T00:00:00.000Z',
    },
    revision: 'a'.repeat(64),
  };
  h.request.mockResolvedValue(old);
  await open();
  action('confirmPayment').onPress();
  await flush();
  const cancel = nodes(render()).findLast((n) => n.props.label === 'back' && n.props.onPress);
  cancel!.props.onPress!();
  expect(h.confirm).not.toHaveBeenCalled();
  const latest = {
    ...old,
    revision: 'b'.repeat(64),
    payment: { ...old.payment, fromName: 'Claimed', fromId: tripId },
  };
  h.request.mockResolvedValue(latest);
  action('confirmPayment').onPress();
  await flush();
  expect(h.confirm).not.toHaveBeenCalled();
  action('reconfirmPayment').onPress();
  action('confirmPayment').onPress();
  await flush();
  h.confirm.mockResolvedValue({ kind: 'not-sent' });
  action('revokePayment').onPress();
  await flush();
  expect(h.confirm.mock.calls[0][1]).toEqual({
    operation: 'payment.delete',
    tripId,
    paymentId,
    body: { expected_revision: latest.revision },
  });
});

it('puts parties, amount and note before optional settlement, keeping raw input and iOS keyboard controls', async () => {
  await open();
  const list = nodes(render());
  const indices = ['paymentFrom', 'paymentTo'].map((title) =>
    list.findIndex((n) => n.props.title === title)
  );
  const amountIndex = list.findIndex((n) => n.props.testID === 'payment-amount');
  const noteIndex = list.findIndex((n) => n.props.testID === 'payment-note');
  const referenceIndex = list.findIndex((n) => n.props.testID === 'payment-reference');
  expect(indices[0]).toBeLessThan(indices[1]);
  expect(indices[1]).toBeLessThan(amountIndex);
  expect(amountIndex).toBeLessThan(noteIndex);
  expect(noteIndex).toBeLessThan(referenceIndex);
  expect(input('amountTwd').kind).toBe('amount');
  input('amountTwd', '00020.01');
  expect(input('amountTwd').value).toBe('00020.01');
  const focus = vi.fn();
  input('paymentNote').inputRef!.current = { focus };
  const done = list.find((n) => n.props.testID === 'payment-keyboard-done')!.props;
  expect(done.style!.minHeight).toBeGreaterThanOrEqual(48);
  done.onPress!();
  expect(h.dismiss).toHaveBeenCalledOnce();
  expect(focus).not.toHaveBeenCalled();
  input('paymentNote').onSubmitEditing!();
  expect(h.dismiss).toHaveBeenCalledTimes(2);
  expect(h.confirm).not.toHaveBeenCalled();
});
it('review contains distinct same-name parties, amount, trimmed note and visible deviation warning', async () => {
  await open();
  input('amountTwd', '60.01');
  input('paymentNote', '  actual payment  ');
  action('confirmPayment').onPress();
  await flush();
  const details = nodes(render())
    .filter((n) => n.props.value && !n.props.onChangeText)
    .map((n) => [n.props.label, n.props.value]);
  expect(details).toContainEqual(['paymentFrom', `Same · #${peerId.slice(-6)}`]);
  expect(details).toContainEqual(['paymentTo', `Same · #${h.scope.accountId.slice(-6)} · you`]);
  expect(details).toContainEqual(['amountTwd', 'NT$60.01']);
  expect(details).toContainEqual(['paymentNote', 'actual payment']);
  expect(nodes(render()).some((n) => n.props.children === 'paymentDeviation')).toBe(true);
  expect(action('recordPayment').variant).toBe('primary');
  expect(h.confirm).not.toHaveBeenCalled();
  action('back').onPress();
  input('amountTwd', '10');
  expect(nodes(render()).some((n) => n.props.testID === 'payment-submit')).toBe(false);
});
it('revocation keeps removed-party label and full record before its separate dangerous confirmation', async () => {
  paymentId = tripId;
  h.request.mockResolvedValue({
    payment: {
      id: paymentId,
      fromId: null,
      fromName: 'Old',
      toId: h.scope.accountId,
      toName: 'Me',
      amount: 20.01,
      note: 'wrong record',
      createdAt: '2026-10-06T12:00:00.000Z',
    },
    revision: 'a'.repeat(64),
  });
  await open();
  expect(
    nodes(render()).some(
      (n) => n.props.label === 'paymentFrom' && n.props.value === 'removedMember'
    )
  ).toBe(true);
  expect(nodes(render()).some((n) => n.props.value === 'wrong record')).toBe(true);
  expect(nodes(render()).some((n) => n.props.children === 'revokePaymentWarning')).toBe(true);
  action('confirmPayment').onPress();
  await flush();
  expect(action('revokePayment').variant).toBe('danger');
  expect(h.confirm).not.toHaveBeenCalled();
});
it('completed payment with refresh failure retries reads without submitting again', async () => {
  await open();
  action('confirmPayment').onPress();
  await flush();
  h.confirm.mockResolvedValue({
    kind: 'completed',
    result: { status: 'committed' },
    refreshed: false,
  });
  action('recordPayment').onPress();
  await flush();
  expect(nodes(render()).some((n) => n.props.children === 'savedRefreshFailed')).toBe(true);
  expect(nodes(render()).some((n) => n.props.testID === 'payment-submit')).toBe(false);
  action('refresh').onPress();
  await flush();
  expect(h.refresh).toHaveBeenCalledOnce();
  expect(h.confirm).toHaveBeenCalledOnce();
  expect(nodes(render()).some((n) => n.props.children === 'operationDone')).toBe(true);
});
it('catalog denial hides every party, reference and write control from a cached form', async () => {
  await open();
  h.visible = false;
  const list = nodes(render());
  expect(
    list.some(
      (n) =>
        n.props.testID === 'payment-amount' ||
        n.props.testID === 'payment-preview' ||
        n.props.testID === 'payment-reference'
    )
  ).toBe(false);
  expect(list.some((n) => n.props.label === 'retry')).toBe(true);
  expect(h.confirm).not.toHaveBeenCalled();
});
it('offline review is disabled and pending outcome exposes recovery without another write control', async () => {
  await open();
  h.online = false;
  expect(action('confirmPayment').disabled).toBe(true);
  h.online = true;
  action('confirmPayment').onPress();
  await flush();
  h.confirm.mockResolvedValue({ kind: 'pending' });
  action('recordPayment').onPress();
  await flush();
  expect(action('pendingOperations')).toBeDefined();
  expect(
    nodes(render()).some(
      (n) => n.props.testID === 'payment-preview' || n.props.testID === 'payment-submit'
    )
  ).toBe(false);
  expect(h.confirm).toHaveBeenCalledOnce();
});

it('reuses label indexes during input renders and builds the conflicting latest context separately', async () => {
  const spy = vi.spyOn(labelHelpers, 'paymentLabels');
  const oldMessages = h.labels;
  const oldViewer = h.scope.accountId;
  try {
    await open();
    render();
    const count = spy.mock.calls.length;
    input('paymentNote', 'first');
    render();
    input('paymentNote', 'second');
    render();
    expect(spy).toHaveBeenCalledTimes(count);
    const latest: PaymentContext = {
      ...original,
      settlementRevision: 'b'.repeat(64),
      members: original.members.map((m) => ({ ...m, displayName: 'New name' })),
      settlement: {
        ...original.settlement,
        suggestedTransfers: original.settlement.suggestedTransfers.map((r) => ({
          ...r,
          fromName: 'New name',
          toName: 'New name',
        })),
      },
    };
    h.request.mockResolvedValue(latest);
    action('confirmPayment').onPress();
    await flush();
    const tree = render();
    expect(spy).toHaveBeenCalledTimes(count + 1);
    expect(spy.mock.calls.at(-1)![0]).toBe(latest);
    expect(spy.mock.calls.at(-1)![1]).toBe(h.scope.accountId);
    expect(spy.mock.calls.at(-1)![2]).toBe(h.labels);
    const text = (node: unknown): string => {
      if (Array.isArray(node)) return node.map(text).join('');
      if (node && typeof node === 'object' && 'props' in node)
        return text((node as { props: { children?: unknown } }).props.children);
      return typeof node === 'string' ? node : '';
    };
    expect(text(tree)).toContain(`Same · #${peerId.slice(-6)}`);
    expect(text(tree)).toContain(`New name · #${peerId.slice(-6)}`);
    const { messages } = await import('@/i18n/messages');
    h.labels = messages.jp;
    render();
    expect(spy).toHaveBeenCalledTimes(count + 3);
    expect(spy.mock.results.at(-1)!.value.choice(h.scope.accountId)).toContain(messages.jp.you);
    h.scope.accountId = peerId;
    render();
    expect(spy).toHaveBeenCalledTimes(count + 5);
    expect(spy.mock.results.at(-1)!.value.choice(peerId)).toContain(messages.jp.you);
  } finally {
    h.labels = oldMessages;
    h.scope.accountId = oldViewer;
    spy.mockRestore();
  }
});
