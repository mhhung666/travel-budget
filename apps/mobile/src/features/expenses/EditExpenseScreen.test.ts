import { ApiError } from '@/api/client';
import { messages, type AppLocale } from '@/i18n/messages';
import { EditExpenseScreen } from './EditExpenseScreen';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ExpenseEditContext } from '@travel-budget/contracts';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  i: 0,
  j: 0,
  effects: [] as (() => (() => void) | void)[],
  lifecycle: (() => undefined) as (state: string) => void,
  focus: (() => undefined) as () => unknown,
  request: vi.fn(),
  confirm: vi.fn(),
  get: vi.fn(),
  pause: vi.fn(),
  remember: vi.fn(),
  visible: true,
  until: 0,
  scope: { environment: 'https://example/api/v1', accountId: '111111111111111111111111' },
  locale: null as AppLocale | null,
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
  useEffect: (effect: () => (() => void) | void) => {
    h.effects.push(effect);
  },
  useMemo: (factory: () => unknown) => factory(),
  useId: () => 'test-accessory',
}));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, fn: (state: string) => void) => {
      h.lifecycle = fn;
      return { remove: vi.fn() };
    },
  },
  Keyboard: { dismiss: vi.fn() },
  Platform: { OS: 'ios' },
  TextInput: 'TextInput',
  View: 'View',
  Pressable: 'Pressable',
  Text: 'Text',
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
      api: { environment: h.scope.environment },
      getSnapshot: () => ({ status: 'signedIn', user: { id: h.scope.accountId } }),
      requestAs: h.request,
    },
  }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({
    catalog: {
      captureAccess: () => () => undefined,
      isVisible: () => h.visible,
      rememberOptions: h.remember,
      deny: vi.fn(),
    },
  }),
}));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => (h.locale ? messages[h.locale] : h.labels),
  useAppLocale: () => h.locale ?? 'en',
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => true }));
vi.mock('./entryQueries', () => ({ refreshTripData: vi.fn() }));
vi.mock('@/storage/pendingExpenseDatabase', () => ({
  openMutationStore: async () => ({
    retryAt: async () => 0,
    rateLimitUntil: () => h.until,
    pause: h.pause,
    get: h.get,
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  onlineManager: { isOnline: () => true, subscribe: () => () => undefined },
  useQueryClient: () => ({}),
}));
const tripId = '222222222222222222222222',
  expenseId = '333333333333333333333333';
const original: ExpenseEditContext = {
  expense: {
    id: expenseId,
    description: 'original',
    date: '2026-10-06',
    category: 'food',
    payerId: h.scope.accountId,
    payerName: 'A',
    amount: 100,
    originalAmount: 100,
    currency: 'TWD',
    exchangeRate: 1,
    splits: [{ userId: h.scope.accountId, displayName: 'A', shareAmount: 100 }],
  },
  category: 'food',
  revision: 'a'.repeat(64),
  options: {
    members: [{ id: h.scope.accountId, displayName: 'A' }],
    categories: ['food', 'other'],
  },
  capabilities: { basic: true, equal: true, reason: null },
};
// Exercise the screen's actual callbacks and request preparation. React mounting and
// native adapters are mocked; these cases do not replace device interaction tests.
let source: string | undefined;
let remove = false;
type NodeProps = {
  children?: unknown;
  testID?: string;
  value?: string;
  kind?: string;
  disabled?: boolean;
  variant?: string;
  label?: string;
  selected?: boolean;
  onPress?: () => void;
  onChangeText?: (value: string) => void;
};
function render() {
  h.i = 0;
  h.j = 0;
  return EditExpenseScreen({ tripId, expenseId, source, remove });
}
function nodes(node: unknown): { props: NodeProps }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as { props: NodeProps };
  return [element, ...nodes(element.props.children)];
}
function find(label: string) {
  const item = nodes(render()).find((n) => n.props.label === label);
  if (!item?.props.onPress) throw new Error(`Missing action ${label}`);
  return { ...item.props, onPress: item.props.onPress };
}
function changeDescription(value: string) {
  const input = nodes(render()).find(
    (n) => n.props.label === 'expenseDescription' && n.props.onChangeText
  );
  if (!input?.props.onChangeText) throw new Error('Missing description input');
  input.props.onChangeText(value);
}
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
beforeEach(() => {
  h.values = [];
  h.refs = [];
  h.effects = [];
  h.i = h.j = 0;
  source = undefined;
  remove = false;
  h.locale = null;
  h.request.mockReset().mockResolvedValue(original);
  h.confirm.mockReset();
  h.get.mockReset();
  h.visible = true;
  h.until = 0;
  h.pause.mockReset().mockImplementation(async (_scope, until) => {
    h.until = until;
  });
  h.remember.mockReset().mockImplementation(async () => {
    h.visible = true;
  });
});
it.each(['preview', 'rejected receipt'])(
  'rebase after %s retains only my changes',
  async (conflictAt) => {
    render();
    h.focus();
    await flush();
    changeDescription('my edit');
    const latest = {
      ...original,
      category: 'other',
      revision: 'b'.repeat(64),
      expense: { ...original.expense, category: 'other' as const },
    };
    if (conflictAt === 'preview') h.request.mockResolvedValue(latest);
    find('reviewExpenseChangesAction').onPress();
    await flush();
    if (conflictAt === 'rejected receipt') {
      h.request.mockResolvedValue(latest);
      h.confirm.mockResolvedValue({
        kind: 'completed',
        result: { status: 'rejected', code: 'RESOURCE_CHANGED' },
      });
      find('confirmExpenseEdit').onPress();
      await flush();
      h.confirm.mockClear();
    }
    find('useLatestExpense').onPress();
    expect(h.confirm).not.toHaveBeenCalled();
    find('reviewExpenseChangesAction').onPress();
    await flush();
    h.confirm.mockResolvedValue({ kind: 'not-sent' });
    find('confirmExpenseEdit').onPress();
    await flush();
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.confirm.mock.calls[0][1].body).toEqual({
      expected_revision: latest.revision,
      mode: 'basic',
      changes: { description: 'my edit' },
    });
  }
);
it('reopened rejected equal edit can explicitly return to metadata-only mode', async () => {
  source = '11111111-1111-4111-8111-111111111111';
  h.get.mockResolvedValue({
    status: 'completed',
    result: { status: 'rejected' },
    payload: {
      operation: 'expense.update',
      tripId,
      expenseId,
      body: {
        mode: 'equal',
        changes: {
          original_amount: 200,
          payer_id: h.scope.accountId,
          splits: [{ user_id: h.scope.accountId, share_amount: 200 }],
        },
      },
    },
  });
  render();
  h.focus();
  await flush();
  expect(find('equalExpense').selected).toBe(true);
  find('basicExpense').onPress();
  expect(find('basicExpense').selected).toBe(true);
  changeDescription('metadata only');
  find('reviewExpenseChangesAction').onPress();
  await flush();
  h.confirm.mockResolvedValue({ kind: 'not-sent' });
  find('confirmExpenseEdit').onPress();
  await flush();
  expect(h.confirm).toHaveBeenCalledTimes(1);
  expect(h.confirm.mock.calls[0][1].body).toEqual({
    expected_revision: original.revision,
    mode: 'basic',
    changes: { description: 'metadata only' },
  });
  expect(h.request.mock.calls.every((call) => !String(call[1]).endsWith('/preview'))).toBe(true);
});

function findId(testID: string) {
  const node = nodes(render()).find((n) => n.props.testID === testID);
  if (!node) throw new Error(`Missing ${testID}`);
  return node.props;
}
async function loadForm() {
  render();
  h.focus();
  await flush();
}
it('requires explicit equal mode, puts amount first and returns to basic without changing protected fields', async () => {
  await loadForm();
  expect(nodes(render()).some((n) => n.props.testID === 'expense-maintain-amount')).toBe(false);
  find('equalExpense').onPress();
  const fields = nodes(render()).filter((n) => n.props.onChangeText);
  expect(fields.map((n) => n.props.testID)).toEqual([
    'expense-maintain-amount',
    'expense-maintain-description',
    'expense-maintain-date',
  ]);
  expect(findId('expense-maintain-amount')).toMatchObject({ kind: 'amount', value: '100' });
  findId('expense-maintain-amount').onChangeText!('0200.50');
  expect(findId('expense-maintain-amount').value).toBe('0200.50');
  find('basicExpense').onPress();
  changeDescription('basic change');
  find('reviewExpenseChangesAction').onPress();
  await flush();
  expect(nodes(render()).some((n) => n.props.value === 'NT$100')).toBe(true);
  h.confirm.mockResolvedValue({ kind: 'not-sent' });
  find('confirmExpenseEdit').onPress();
  await flush();
  expect(h.confirm.mock.calls[0][1].body.changes).toEqual({ description: 'basic change' });
});
it('new previews and input changes do not bypass the explicit E confirmation', async () => {
  await loadForm();
  find('equalExpense').onPress();
  h.request.mockImplementation(async (_account, path) =>
    path.endsWith('/preview') ? { amount: 100, splits: original.expense.splits } : original
  );
  find('previewSplit').onPress();
  await flush();
  expect(findId('expense-maintain-confirm').variant).toBe('primary');
  expect(h.confirm).not.toHaveBeenCalled();
  changeDescription('new description');
  expect(nodes(render()).some((n) => n.props.testID === 'expense-maintain-confirm')).toBe(false);
  expect(h.confirm).not.toHaveBeenCalled();
});
it('keeps unknown category and foreign shares in basic mode and cannot enable unsupported equal editing', async () => {
  const foreign = {
    ...original,
    category: 'legacy-transport',
    capabilities: { ...original.capabilities, equal: false },
    expense: {
      ...original.expense,
      amount: 99.9,
      originalAmount: 3000,
      currency: 'JPY',
      exchangeRate: 0.0333,
      splits: [{ ...original.expense.splits[0], shareAmount: 99.9 }],
    },
  };
  h.request.mockResolvedValue(foreign);
  await loadForm();
  expect(find('equalExpense').disabled).toBe(true);
  changeDescription('foreign metadata');
  find('reviewExpenseChangesAction').onPress();
  await flush();
  h.confirm.mockResolvedValue({ kind: 'not-sent' });
  find('confirmExpenseEdit').onPress();
  await flush();
  expect(h.confirm.mock.calls[0][1].body).toEqual({
    expected_revision: foreign.revision,
    mode: 'basic',
    changes: { description: 'foreign metadata' },
  });
});
it('delete still requires a fresh review and a separate danger confirmation', async () => {
  remove = true;
  await loadForm();
  expect(nodes(render()).some((n) => n.props.onChangeText)).toBe(false);
  find('reviewExpenseChangesAction').onPress();
  await flush();
  expect(h.confirm).not.toHaveBeenCalled();
  expect(findId('expense-maintain-confirm').variant).toBe('danger');
  h.confirm.mockResolvedValue({ kind: 'not-sent' });
  find('deleteExpense').onPress();
  await flush();
  expect(h.confirm.mock.calls[0][1]).toEqual({
    operation: 'expense.delete',
    tripId,
    expenseId,
    body: { base_currency: 'TWD', expected_revision: original.revision },
  });
});

const foreignEqual: ExpenseEditContext = {
  ...original,
  capabilities: { basic: true, equal: false, recalculate: true, reason: 'foreign' },
  expense: {
    ...original.expense,
    currency: 'JPY',
    exchangeRate: 0.2156789012345,
    originalAmount: 100,
    amount: 21.57,
    splits: [{ ...original.expense.splits[0], shareAmount: 21.57 }],
  },
  options: {
    ...original.options,
    supportedCurrencies: ['TWD', 'JPY', 'USD'],
    currencySettings: {
      default_currency: 'USD',
      currencies: [
        { code: 'JPY', rate: 9 },
        { code: 'USD', rate: 30 },
      ],
    },
  },
};
function previewRequest(context = foreignEqual) {
  h.request.mockImplementation(async (_account, path, _schema, options) => {
    if (!path.endsWith('/preview')) return context;
    const body = options.body;
    const total = Math.round(body.amount * (body.exchange_rate ?? 1) * 100) / 100;
    return {
      amount: total,
      ...(body.currency
        ? { originalAmount: body.amount, currency: body.currency, exchangeRate: body.exchange_rate }
        : {}),
      splits: [{ userId: h.scope.accountId, displayName: 'A', shareAmount: total }],
    };
  });
}
it.each(['zh', 'zh-CN', 'en', 'jp'] as AppLocale[])(
  'foreign editing in %s keeps historical rate and explicitly confirms full monetary source',
  async (locale) => {
    h.locale = locale;
    const t = messages[locale];
    previewRequest();
    await loadForm();
    expect(
      nodes(render()).some(
        (n) => n.props.onChangeText && n.props.testID === 'expense-maintain-rate'
      )
    ).toBe(false);
    find(t.equalExpense).onPress();
    expect(findId('expense-maintain-rate').value).toBe('0.2156789012345');
    expect(nodes(render()).some((n) => n.props.children === t.editCurrencyHint)).toBe(true);
    findId('expense-maintain-amount').onChangeText!('0200.01');
    findId('expense-maintain-rate').onChangeText!('0.3333333333333333');
    find(t.previewSplit).onPress();
    await flush();
    expect(h.confirm).not.toHaveBeenCalled();
    expect(
      nodes(render()).some((n) => n.props.value === '0.2156789012345 → 0.3333333333333333')
    ).toBe(true);
    h.confirm.mockResolvedValue({
      kind: 'completed',
      result: { status: 'committed' },
      refreshed: true,
    });
    find(t.confirmExpenseEdit).onPress();
    await flush();
    expect(h.confirm.mock.calls[0][1].body.changes).toMatchObject({
      original_amount: 200.01,
      currency: 'JPY',
      exchange_rate: 0.3333333333333333,
      splits: [{ user_id: h.scope.accountId, share_amount: 66.67 }],
    });
    expect(findId('expense-maintain-saved')).toBeTruthy();
    expect(nodes(render()).some((n) => n.props.value === '0.3333333333333333')).toBe(true);
  }
);
it('currency switching preserves digits, uses only explicit new-currency defaults, and restores the historical rate', async () => {
  previewRequest();
  await loadForm();
  find('equalExpense').onPress();
  findId('expense-maintain-amount').onChangeText!('00100.01');
  find('previewSplit').onPress();
  await flush();
  expect(findId('expense-maintain-confirm')).toBeTruthy();
  findId('expense-maintain-currency-USD').onPress!();
  expect(findId('expense-maintain-rate').value).toBe('30');
  expect(findId('expense-maintain-amount').value).toBe('00100.01');
  expect(nodes(render()).some((n) => n.props.testID === 'expense-maintain-confirm')).toBe(false);
  findId('expense-maintain-currency-JPY').onPress!();
  expect(findId('expense-maintain-rate').value).toBe('0.2156789012345');
  findId('expense-maintain-currency-TWD').onPress!();
  expect(nodes(render()).some((n) => n.props.testID === 'expense-maintain-rate')).toBe(false);
  find('previewSplit').onPress();
  await flush();
  h.confirm.mockResolvedValue({ kind: 'not-sent' });
  find('confirmExpenseEdit').onPress();
  await flush();
  expect(h.confirm.mock.calls[0][1].body.changes).toMatchObject({
    currency: 'TWD',
    exchange_rate: 1,
    original_amount: 100.01,
  });
});
it.each(['expense-maintain-amount', 'expense-maintain-rate'])(
  'late preview cannot restore confirmation after %s changed',
  async (field) => {
    previewRequest();
    await loadForm();
    find('equalExpense').onPress();
    let reply!: (value: unknown) => void;
    h.request.mockImplementation(async (_account, path) =>
      path.endsWith('/preview')
        ? new Promise((resolve) => {
            reply = resolve;
          })
        : foreignEqual
    );
    find('previewSplit').onPress();
    await flush();
    findId(field).onChangeText!(field.endsWith('amount') ? '101' : '0.5');
    reply({
      amount: 21.57,
      originalAmount: 100,
      currency: 'JPY',
      exchangeRate: 0.2156789012345,
      splits: foreignEqual.expense.splits,
    });
    await flush();
    expect(nodes(render()).some((n) => n.props.testID === 'expense-maintain-confirm')).toBe(false);
    expect(h.confirm).not.toHaveBeenCalled();
  }
);
it('rejected foreign edit resumes its frozen currency/rate, then needs new preview and confirmation', async () => {
  source = '11111111-1111-4111-8111-111111111111';
  h.get.mockResolvedValue({
    status: 'completed',
    result: { status: 'rejected' },
    payload: {
      operation: 'expense.update',
      tripId,
      expenseId,
      body: {
        mode: 'equal',
        changes: {
          original_amount: 0.01,
          currency: 'USD',
          exchange_rate: 1e-12,
          payer_id: h.scope.accountId,
          splits: [{ user_id: h.scope.accountId, share_amount: 0 }],
        },
      },
    },
  });
  previewRequest();
  await loadForm();
  expect(find('equalExpense').selected).toBe(true);
  expect(findId('expense-maintain-rate').value).toBe('1e-12');
  expect(findId('expense-maintain-amount').value).toBe('0.01');
  expect(h.confirm).not.toHaveBeenCalled();
  find('previewSplit').onPress();
  await flush();
  h.confirm.mockResolvedValue({ kind: 'not-sent' });
  find('confirmExpenseEdit').onPress();
  await flush();
  expect(h.confirm.mock.calls[0][1].body.changes).toMatchObject({
    currency: 'USD',
    exchange_rate: 1e-12,
  });
});
it('conflict to a non-equal expense disables recalculation without writing or clearing metadata edits', async () => {
  previewRequest();
  await loadForm();
  find('equalExpense').onPress();
  changeDescription('my metadata');
  const latest = {
    ...foreignEqual,
    revision: 'b'.repeat(64),
    capabilities: { basic: true, equal: false, recalculate: false, reason: 'historical' },
  };
  h.request.mockResolvedValue(latest);
  find('previewSplit').onPress();
  await flush();
  find('useLatestExpense').onPress();
  expect(find('equalExpense').disabled).toBe(true);
  expect(find('basicExpense').selected).toBe(true);
  find('reviewExpenseChangesAction').onPress();
  await flush();
  h.confirm.mockResolvedValue({ kind: 'not-sent' });
  find('confirmExpenseEdit').onPress();
  await flush();
  expect(h.confirm.mock.calls[0][1].body).toEqual({
    expected_revision: latest.revision,
    mode: 'basic',
    changes: { description: 'my metadata' },
  });
});

it('explicit context retry can restore hidden access, while later preview requires visible catalog', async () => {
  h.visible = false;
  previewRequest();
  await loadForm();
  expect(h.remember).toHaveBeenCalledWith(h.scope, tripId, foreignEqual.options);
  find('equalExpense').onPress();
  const preview = find('previewSplit');
  h.visible = false;
  const calls = h.request.mock.calls.length;
  preview.onPress();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(calls);
  expect(h.confirm).not.toHaveBeenCalled();
});
it('failed 429 persistence blocks subsequent reads until saving the original deadline succeeds', async () => {
  h.request.mockRejectedValueOnce(new ApiError('BUSY', 429, 120));
  h.pause.mockRejectedValue(new Error('disk full'));
  await loadForm();
  const until = h.pause.mock.calls[0][1];
  find('retry').onPress();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(h.pause.mock.calls[1][1]).toBe(until);
  h.pause.mockImplementation(async (_scope, deadline) => {
    h.until = deadline;
  });
  find('retry').onPress();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(1); // persisted wait still prevents transport
  expect(h.until).toBe(until);
  expect(h.confirm).not.toHaveBeenCalled();
});

it('backgrounding invalidates confirmation and a preview still in flight', async () => {
  previewRequest();
  await loadForm();
  const dispose = h.effects[0]();
  find('equalExpense').onPress();
  find('previewSplit').onPress();
  await flush();
  expect(findId('expense-maintain-confirm')).toBeTruthy();
  h.lifecycle('background');
  expect(nodes(render()).some((n) => n.props.testID === 'expense-maintain-confirm')).toBe(false);
  let reply!: (value: unknown) => void;
  h.request.mockImplementation(async (_account, path) =>
    path.endsWith('/preview')
      ? new Promise((resolve) => {
          reply = resolve;
        })
      : foreignEqual
  );
  find('previewSplit').onPress();
  await flush();
  h.lifecycle('inactive');
  reply({
    amount: 21.57,
    originalAmount: 100,
    currency: 'JPY',
    exchangeRate: 0.2156789012345,
    splits: foreignEqual.expense.splits,
  });
  await flush();
  expect(nodes(render()).some((n) => n.props.testID === 'expense-maintain-confirm')).toBe(false);
  expect(h.confirm).not.toHaveBeenCalled();
  dispose?.();
});
it('conflict reconfirmation keeps 120 JPY as a complete input instead of mixing with remote USD', async () => {
  previewRequest();
  await loadForm();
  find('equalExpense').onPress();
  findId('expense-maintain-amount').onChangeText!('120');
  const latest = {
    ...foreignEqual,
    revision: 'b'.repeat(64),
    expense: {
      ...foreignEqual.expense,
      originalAmount: 20,
      currency: 'USD',
      exchangeRate: 30,
      amount: 600,
      splits: [{ ...foreignEqual.expense.splits[0], shareAmount: 600 }],
    },
  };
  previewRequest(latest);
  find('previewSplit').onPress();
  await flush();
  find('useLatestExpense').onPress();
  expect(findId('expense-maintain-amount').value).toBe('120');
  expect(findId('expense-maintain-rate').value).toBe('0.2156789012345');
  expect(h.confirm).not.toHaveBeenCalled();
  find('previewSplit').onPress();
  await flush();
  expect(h.request.mock.calls.findLast((call) => call[1].endsWith('/preview'))?.[3].body).toEqual({
    amount: 120,
    currency: 'JPY',
    exchange_rate: 0.2156789012345,
    member_ids: [h.scope.accountId],
  });
  find('confirmExpenseEdit').onPress();
  await flush();
  expect(h.confirm.mock.calls[0][1].body).toMatchObject({
    expected_revision: latest.revision,
    changes: { original_amount: 120, currency: 'JPY', exchange_rate: 0.2156789012345 },
  });
});

function advancedContext() {
  const modes = ['equal', 'amount', 'percent', 'shares'] as const;
  return {
    ...original,
    ledger: { baseCurrency: 'TWD', moneyScale: 2 as const },
    options: { ...original.options, splitPreviewModes: [...modes] },
    capabilities: { ...original.capabilities, equal: false, splitModes: [...modes] },
  };
}
function splitNodes() {
  const element = nodes(render()).find(
    (n) => (n as { type?: { name?: string } }).type?.name === 'SplitFields'
  ) as unknown as { type: (p: never) => unknown; props: never };
  return nodes(element.type(element.props));
}
function splitField(id: string) {
  const item = splitNodes().find((n) => n.props.testID === id);
  if (!item) throw new Error(`Missing split input ${id}`);
  return item.props;
}
function previewFor(mode: 'equal' | 'amount' | 'percent' | 'shares') {
  return {
    ledger: { baseCurrency: 'TWD', moneyScale: 2 },
    amount: 100,
    originalAmount: 100,
    currency: 'TWD',
    exchangeRate: 1,
    splitMode: mode,
    splits: original.expense.splits.map((s) => ({ ...s, originalShareAmount: 100 })),
  };
}
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'requires a new split choice in %s and confirms both units without inferring historical intent',
  async (locale) => {
    h.locale = locale;
    const ctx = advancedContext();
    h.request.mockResolvedValue(ctx);
    await loadForm();
    expect(findId('expense-maintain-basic').selected).toBe(true);
    findId('expense-maintain-resplit').onPress!();
    expect(
      splitNodes()
        .filter((n) => n.props.testID?.startsWith('expense-split-mode-'))
        .every((n) => !n.props.selected)
    ).toBe(true);
    findId('expense-maintain-preview').onPress!();
    await flush();
    expect(h.request.mock.calls.some((c) => String(c[1]).endsWith('/preview'))).toBe(false);
    for (const mode of ['equal', 'amount', 'percent', 'shares'] as const) {
      splitField(`expense-split-mode-${mode}`).onPress!();
      if (mode !== 'equal')
        splitField(`expense-split-value-${h.scope.accountId}`).onChangeText!(
          mode === 'shares' ? '0002.0000' : '00100.00'
        );
      h.request.mockImplementation(async (_user, path) =>
        String(path).endsWith('/preview') ? previewFor(mode) : ctx
      );
      findId('expense-maintain-preview').onPress!();
      await flush();
      expect(findId('expense-maintain-confirm')).toBeTruthy();
      expect(
        nodes(render()).some(
          (n) => n.props.label === messages[locale].originalAmount && n.props.value?.includes('100')
        )
      ).toBe(true);
      h.confirm.mockResolvedValue({ kind: 'not-sent' });
      findId('expense-maintain-confirm').onPress!();
      await flush();
      expect(h.confirm.mock.lastCall?.[1].body).toMatchObject({
        mode: 'split',
        expected_revision: ctx.revision,
        changes: {
          split: mode === 'equal' ? { mode } : { mode, values: [mode === 'shares' ? 2 : 100] },
          original_amount: 100,
          currency: 'TWD',
          exchange_rate: 1,
        },
      });
    }
    findId('expense-maintain-basic').onPress!();
    findId('expense-maintain-description').onChangeText!('only metadata');
    findId('expense-maintain-preview').onPress!();
    await flush();
    findId('expense-maintain-confirm').onPress!();
    await flush();
    expect(h.confirm.mock.lastCall?.[1].body).toEqual({
      base_currency: 'TWD',
      mode: 'basic',
      expected_revision: ctx.revision,
      changes: { description: 'only metadata' },
    });
  }
);
it('requires explicit removal of unknown historical members and never treats their shares as an input mode', async () => {
  const ctx = advancedContext();
  const historical = {
    ...ctx,
    expense: {
      ...ctx.expense,
      payerId: null,
      splits: [{ userId: null, displayName: 'Gone', shareAmount: 100 }],
    },
  };
  h.request.mockResolvedValue(historical);
  await loadForm();
  findId('expense-maintain-resplit').onPress!();
  splitField('expense-split-mode-equal').onPress!();
  findId('expense-maintain-preview').onPress!();
  await flush();
  expect(h.confirm).not.toHaveBeenCalled();
  expect(findId('expense-maintain-remove-missing')).toBeTruthy();
  findId('expense-maintain-remove-missing').onPress!();
  findId(`expense-maintain-split-${h.scope.accountId}`).onPress!();
  findId(`expense-maintain-payer-${h.scope.accountId}`).onPress!();
  h.request.mockImplementation(async (_user, path) =>
    String(path).endsWith('/preview') ? previewFor('equal') : historical
  );
  findId('expense-maintain-preview').onPress!();
  await flush();
  expect(findId('expense-maintain-confirm')).toBeTruthy();
});
it('split changes cancel an in-flight preview, including a late successful reply', async () => {
  const ctx = advancedContext();
  h.request.mockResolvedValue(ctx);
  await loadForm();
  findId('expense-maintain-resplit').onPress!();
  splitField('expense-split-mode-shares').onPress!();
  let resolve!: (v: unknown) => void;
  h.request.mockImplementation(async (_user, path) =>
    String(path).endsWith('/preview')
      ? new Promise((r) => {
          resolve = r;
        })
      : ctx
  );
  findId('expense-maintain-preview').onPress!();
  await flush();
  splitField(`expense-split-value-${h.scope.accountId}`).onChangeText!('2');
  resolve(previewFor('shares'));
  await flush();
  expect(nodes(render()).some((n) => n.props.testID === 'expense-maintain-confirm')).toBe(false);
  expect(h.confirm).not.toHaveBeenCalled();
});
it('reopens a rejected split from its frozen ID-aligned values without resending, and permits basic editing', async () => {
  const ctx = advancedContext();
  source = '11111111-1111-4111-8111-111111111111';
  h.request.mockResolvedValue(ctx);
  h.get.mockResolvedValue({
    status: 'completed',
    result: { status: 'rejected' },
    payload: {
      operation: 'expense.update',
      tripId,
      expenseId,
      body: {
        mode: 'split',
        changes: {
          original_amount: 200,
          currency: 'JPY',
          exchange_rate: 0.25,
          payer_id: h.scope.accountId,
          split: { mode: 'shares', values: [null] },
          splits: [{ user_id: h.scope.accountId, share_amount: 50 }],
        },
      },
    },
  });
  await loadForm();
  expect(findId('expense-maintain-resplit').selected).toBe(true);
  expect(splitField('expense-split-mode-shares').selected).toBe(true);
  expect(splitField(`expense-split-value-${h.scope.accountId}`).value).toBe('');
  expect(findId('expense-maintain-amount').value).toBe('200');
  expect(h.confirm).not.toHaveBeenCalled();
  findId('expense-maintain-basic').onPress!();
  changeDescription('basic after rejection');
  findId('expense-maintain-preview').onPress!();
  await flush();
  h.confirm.mockResolvedValue({ kind: 'not-sent' });
  findId('expense-maintain-confirm').onPress!();
  await flush();
  expect(h.confirm.mock.lastCall?.[1].body.changes).toEqual({
    description: 'basic after rejection',
  });
});
it('conflict review keeps split input and requires another preview using the reviewed revision', async () => {
  const ctx = advancedContext();
  h.request.mockResolvedValue(ctx);
  await loadForm();
  findId('expense-maintain-resplit').onPress!();
  splitField('expense-split-mode-amount').onPress!();
  splitField(`expense-split-value-${h.scope.accountId}`).onChangeText!('00100.00');
  const latest = {
    ...ctx,
    revision: 'b'.repeat(64),
    expense: {
      ...ctx.expense,
      description: 'remote',
      currency: 'JPY',
      exchangeRate: 0.25,
      originalAmount: 400,
    },
  };
  h.request.mockResolvedValue(latest);
  findId('expense-maintain-preview').onPress!();
  await flush();
  findId('expense-maintain-latest').onPress!();
  expect(findId('expense-maintain-resplit').selected).toBe(true);
  expect(splitField(`expense-split-value-${h.scope.accountId}`).value).toBe('00100.00');
  expect(findId('expense-maintain-amount').value).toBe('100');
  expect(findId('expense-maintain-description').value).toBe('remote');
  expect(h.confirm).not.toHaveBeenCalled();
  h.request.mockImplementation(async (_user, path) =>
    String(path).endsWith('/preview') ? previewFor('amount') : latest
  );
  findId('expense-maintain-preview').onPress!();
  await flush();
  h.confirm.mockResolvedValue({ kind: 'not-sent' });
  findId('expense-maintain-confirm').onPress!();
  await flush();
  expect(h.confirm.mock.lastCall?.[1].body).toMatchObject({
    expected_revision: latest.revision,
    mode: 'split',
    changes: { currency: 'TWD', split: { mode: 'amount', values: [100] } },
  });
  expect(h.confirm.mock.lastCall?.[1].body.changes.description).toBeUndefined();
});

it('backgrounding during the confirmation guard prevents freezing the invalidated preview', async () => {
  const ctx = advancedContext();
  h.request.mockResolvedValue(ctx);
  await loadForm();
  h.effects[0]();
  findId('expense-maintain-resplit').onPress!();
  splitField('expense-split-mode-equal').onPress!();
  h.request.mockImplementation(async (_user, path) =>
    String(path).endsWith('/preview') ? previewFor('equal') : ctx
  );
  findId('expense-maintain-preview').onPress!();
  await flush();
  findId('expense-maintain-confirm').onPress!();
  h.lifecycle('background');
  await flush();
  expect(h.confirm).not.toHaveBeenCalled();
  expect(nodes(render()).some((n) => n.props.testID === 'expense-maintain-confirm')).toBe(false);
});
