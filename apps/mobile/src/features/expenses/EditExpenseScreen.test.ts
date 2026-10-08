import { EditExpenseScreen } from './EditExpenseScreen';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ExpenseEditContext } from '@travel-budget/contracts';
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
  useMemo: (factory: () => unknown) => factory(),
  useId: () => 'test-accessory',
}));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  AppState: { currentState: 'active' },
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
vi.mock('@/i18n/useMessages', () => ({ useMessages: () => h.labels, useAppLocale: () => 'en' }));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => true }));
vi.mock('./entryQueries', () => ({ refreshTripData: vi.fn() }));
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
  h.i = h.j = 0;
  source = undefined;
  remove = false;
  h.request.mockReset().mockResolvedValue(original);
  h.confirm.mockReset();
  h.get.mockReset();
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
    body: { expected_revision: original.revision },
  });
});
