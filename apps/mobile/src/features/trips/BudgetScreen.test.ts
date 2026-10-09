import { beforeEach, expect, it, vi } from 'vitest';
import { BudgetScreen } from './BudgetScreen';
import { ApiError } from '@/api/client';
import type { BudgetContext } from '@travel-budget/contracts';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  i: 0,
  j: 0,
  effects: [] as (() => (() => void) | void)[],
  request: vi.fn(),
  confirm: vi.fn(),
  get: vi.fn(),
  pause: vi.fn(),
  retryAt: vi.fn(),
  refresh: vi.fn(),
  prevent: vi.fn(),
  online: true,
  visible: true,
  version: 1,
  access: 1,
  until: 0,
  user: 'a'.repeat(24),
  environment: 'https://test/api/v1',
  connection: (() => {}) as (online: boolean) => void,
  background: (() => {}) as (state: string) => void,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.i++;
    if (!(i in h.values)) h.values[i] = initial;
    return [
      h.values[i],
      (v: unknown) => {
        h.values[i] = typeof v === 'function' ? v(h.values[i]) : v;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.j++] ??= { current: initial }),
  useEffect: (fn: () => (() => void) | void) => h.effects.push(fn),
}));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
  InputAccessoryView: 'InputAccessoryView',
  Keyboard: { dismiss: vi.fn() },
  TextInput: 'TextInput',
  AppState: {
    currentState: 'active',
    addEventListener: (_name: string, fn: typeof h.background) => {
      h.background = fn;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock('expo-router', () => ({
  router: { push: vi.fn(), replace: vi.fn(), dismissTo: vi.fn() },
  useNavigation: () => ({ dispatch: vi.fn() }),
}));
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: h.prevent }));
vi.mock('@/components/screen', () => ({ FormPage: 'FormPage' }));
vi.mock('@/components/navigation', () => ({ goBack: vi.fn() }));
vi.mock('@/components/ui', () =>
  Object.fromEntries(
    ['Action', 'Card', 'Copy', 'DetailRow', 'Notice', 'Section', 'TextField', 'Chip'].map((n) => [
      n,
      n,
    ])
  )
);
vi.mock('@/i18n/useDisplayFormat', () => ({
  useDisplayFormat: () => ({ money: (n: number) => `USD ${n}` }),
}));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => new Proxy({}, { get: (_target, key) => String(key) }),
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
  onlineManager: {
    isOnline: () => h.online,
    subscribe: (fn: typeof h.connection) => {
      h.connection = fn;
      return vi.fn();
    },
  },
}));
vi.mock('@/features/tripEntry/provider', () => ({
  useTripEntry: () => ({
    scope: { environment: h.environment, accountId: 'a'.repeat(24) },
    entry: { confirm: h.confirm },
    manager: {
      api: { environment: h.environment },
      getSignInVersion: () => h.version,
      getSnapshot: () => ({ status: 'signedIn', user: { id: h.user } }),
      requestAs: h.request,
    },
  }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({
    catalog: {
      isVisible: () => h.visible,
      captureAccess: () => {
        const access = h.access;
        return () => {
          if (access !== h.access) throw new ApiError('CANCELLED');
        };
      },
      deny: async () => {
        h.access++;
        h.visible = false;
      },
    },
  }),
}));
vi.mock('@/storage/pendingExpenseDatabase', () => ({
  openMutationStore: async () => ({
    retryAt: h.retryAt,
    rateLimitUntil: () => h.until,
    get: h.get,
    pause: h.pause,
  }),
}));
vi.mock('./managementRefresh', () => ({ refreshManagedTrip: h.refresh }));
const tripId = 'b'.repeat(24);
const original: BudgetContext = {
  tripId,
  ledger: { baseCurrency: 'USD', moneyScale: 2 },
  revision: 'c'.repeat(64),
  budget: { total: 120, categories: [{ category: 'food', amount: 30 }] },
  progress: {
    total: 120,
    totalSpent: 150,
    remaining: -30,
    hasBudget: true,
    categories: [{ category: 'food', budget: 30, spent: 150, remaining: -120 }],
  },
};
interface Props {
  testID?: string;
  label?: string;
  value?: string;
  children?: unknown;
  editable?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onPress?: () => unknown;
  onChangeText?: (value: string) => void;
  inputRef?: { current: unknown };
  onSubmitEditing?: () => void;
}
function render(source?: string) {
  h.i = h.j = 0;
  return BudgetScreen({ tripId, source });
}
function nodes(node: unknown): { props: Props }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const item = node as { props: Props };
  return [item, ...nodes(item.props.children)];
}
function find(id: string, source?: string) {
  const found = nodes(render(source)).find((n) => n.props.testID === id);
  if (!found) throw new Error(`Missing ${id}`);
  return found.props;
}
function edit(key: string, value: string) {
  find(`budget-${key}`).onChangeText!(value);
}
async function flush() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function mount(source?: string) {
  render(source);
  const cleanup = h.effects[0]();
  await flush();
  return cleanup;
}
beforeEach(() => {
  vi.resetAllMocks();
  h.values = [];
  h.refs = [];
  h.effects = [];
  h.i = h.j = 0;
  h.online = h.visible = true;
  h.version = h.access = 1;
  h.until = 0;
  h.retryAt.mockImplementation(async () => h.until);
  h.user = 'a'.repeat(24);
  h.request.mockImplementation(async (_actor, _path, _schema, options) => {
    options?.beforeSend?.();
    return original;
  });
  h.pause.mockImplementation(async (_scope, until: number) => {
    h.until = Math.max(h.until, until);
  });
  h.confirm.mockResolvedValue({
    kind: 'completed',
    result: {
      status: 'committed',
      operation: 'budget.set',
      resourceId: tripId,
      result: { tripId, revision: 'e'.repeat(64) },
    },
  });
});
it('reviews complete private budget, double tap writes once and progress remains the last server snapshot', async () => {
  await mount();
  expect(nodes(render()).some((n) => n.props.children === 'budgetProgressHint')).toBe(true);
  edit('total', '00200.01');
  edit('category-food', '80');
  await find('budget-review').onPress!();
  await flush();
  const confirm = find('budget-confirm');
  confirm.onPress!();
  confirm.onPress!();
  await flush();
  expect(h.confirm).toHaveBeenCalledOnce();
  expect(h.confirm.mock.calls[0][1]).toEqual({
    operation: 'budget.set',
    tripId,
    body: {
      base_currency: 'USD',
      expected_revision: original.revision,
      total: 200.01,
      categories: [{ category: 'food', amount: 80 }],
    },
  });
});
it('clear is only input until explicitly reviewed and confirmed', async () => {
  await mount();
  find('budget-clear').onPress!();
  expect(h.confirm).not.toHaveBeenCalled();
  await find('budget-review').onPress!();
  await flush();
  await find('budget-confirm').onPress!();
  await flush();
  expect(h.confirm.mock.calls[0][1].body).toMatchObject({ total: null, categories: [] });
});
it('concurrent Web edit adopts untouched fields, retains explicit changes and requires new review', async () => {
  await mount();
  edit('category-food', '50');
  const latest = {
    ...original,
    revision: 'd'.repeat(64),
    budget: {
      total: 300,
      categories: [
        { category: 'food', amount: 90 },
        { category: 'shopping', amount: 60 },
      ],
    },
  };
  h.request.mockResolvedValue(latest);
  await find('budget-review').onPress!();
  await flush();
  expect(nodes(render()).some((n) => n.props.testID === 'budget-confirm')).toBe(false);
  find('budget-reconfirm').onPress!();
  expect(find('budget-total').value).toBe('300');
  expect(find('budget-category-food').value).toBe('50');
  expect(find('budget-category-shopping').value).toBe('60');
  await find('budget-review').onPress!();
  await flush();
  await find('budget-confirm').onPress!();
  await flush();
  expect(h.confirm.mock.calls[0][1].body.expected_revision).toBe(latest.revision);
});
it.each(['edit', 'offline', 'background'] as const)(
  '%s invalidates review and late responses',
  async (event) => {
    await mount();
    edit('total', '200');
    let resolve!: (v: unknown) => void;
    h.request.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    find('budget-review').onPress!();
    await flush();
    if (event === 'edit') edit('total', '300');
    else if (event === 'offline') h.connection(false);
    else h.background('background');
    resolve(original);
    await flush();
    expect(nodes(render()).some((n) => n.props.testID === 'budget-confirm')).toBe(false);
    expect(h.confirm).not.toHaveBeenCalled();
  }
);
it('background during the SQLite confirmation guard cannot freeze the old review', async () => {
  await mount();
  edit('total', '200');
  await find('budget-review').onPress!();
  await flush();
  find('budget-confirm').onPress!();
  h.background('background');
  await flush();
  expect(h.confirm).not.toHaveBeenCalled();
});
it('reopens only a rejected same-trip budget without automatically sending', async () => {
  h.get.mockResolvedValue({
    status: 'completed',
    tripId,
    result: { status: 'rejected' },
    payload: {
      operation: 'budget.set',
      body: { total: 200, categories: [{ category: 'shopping', amount: 40 }] },
    },
  });
  await mount('11111111-1111-4111-8111-111111111111');
  expect(find('budget-total').value).toBe('200');
  expect(find('budget-category-shopping').value).toBe('40');
  expect(h.confirm).not.toHaveBeenCalled();
  const source = '11111111-1111-4111-8111-111111111111';
  find('budget-discard', source).onPress!();
  await find('budget-refresh', source).onPress!();
  await flush();
  expect(find('budget-total', source).value).toBe('120');
  expect(h.get).toHaveBeenCalledOnce();
});
it('429 persists the original deadline and revocation hides all private values', async () => {
  await mount();
  edit('total', '200');
  h.request.mockRejectedValueOnce(new ApiError('BUSY', 429, 120));
  await find('budget-review').onPress!();
  await flush();
  expect(h.pause).toHaveBeenCalledOnce();
  const calls = h.request.mock.calls.length;
  await find('budget-review').onPress!();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(calls);
  h.visible = false;
  h.access++;
  expect(nodes(render()).some((n) => n.props.testID === 'budget-total')).toBe(false);
  expect(h.confirm).not.toHaveBeenCalled();
});
it('account change during reads ignores the old private response', async () => {
  let resolve!: (v: unknown) => void;
  h.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  await mount();
  h.user = 'd'.repeat(24);
  h.version++;
  resolve(original);
  await flush();
  expect(nodes(render()).some((n) => n.props.testID === 'budget-total')).toBe(false);
});
