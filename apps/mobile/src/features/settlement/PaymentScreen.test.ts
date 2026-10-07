import { PaymentScreen } from './PaymentScreen';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PaymentContext } from '@travel-budget/contracts';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  i: 0,
  j: 0,
  focus: (() => undefined) as () => unknown,
  request: vi.fn(),
  confirm: vi.fn(),
  get: vi.fn(),
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
  useEffect: () => undefined,
}));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  AppState: { currentState: 'active' },
  Keyboard: { dismiss: vi.fn() },
  Platform: { OS: 'ios' },
  TextInput: 'TextInput',
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
vi.mock('@/components/ui', () =>
  Object.fromEntries(
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
  )
);
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
      isVisible: () => true,
      deny: vi.fn(),
    },
  }),
}));
vi.mock('@/i18n/useMessages', () => ({ useMessages: () => h.labels }));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => true }));
vi.mock('@/features/expenses/entryQueries', () => ({ refreshTripData: vi.fn() }));
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
  label?: string;
  value?: string;
  disabled?: boolean;
  onPress?: () => void;
  onChangeText?: (value: string) => void;
};
function render() {
  h.i = h.j = 0;
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
  h.refs = [];
  h.i = h.j = 0;
  paymentId = source = undefined;
  h.request.mockReset().mockResolvedValue(original);
  h.confirm.mockReset();
  h.get.mockReset();
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
