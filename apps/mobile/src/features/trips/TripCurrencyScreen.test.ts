import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TripCurrencyScreen } from './TripCurrencyScreen';
import { ApiError } from '@/api/client';
import type { TripCurrencyContext } from '@travel-budget/contracts';
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
      api: { baseUrl: h.environment },
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
const original: TripCurrencyContext = {
  tripId,
  role: 'admin',
  revision: 'c'.repeat(64),
  settings: { default_currency: null, currencies: [{ code: 'JPY', rate: null }] },
  supportedCurrencies: ['TWD', 'JPY', 'USD', 'KRW'],
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
  return TripCurrencyScreen({ tripId, source });
}
function nodes(node: unknown): { props: Props }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const item = node as { props: Props };
  return [item, ...nodes(item.props.children)];
}
function find(id: string) {
  const found = nodes(render()).find((n) => n.props.testID === id);
  if (!found) throw new Error(`Missing ${id}`);
  return found.props;
}
function edit(key: string, value: string) {
  find(`currency-rate-${key}`).onChangeText!(value);
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
      operation: 'trip.currency',
      resourceId: tripId,
      result: { tripId, revision: 'e'.repeat(64) },
    },
  });
});
it('fresh review, precise rate and double tap confirmation; input change clears prepared', async () => {
  await mount();
  edit('JPY', '0.2156789012345');
  await find('currency-review').onPress!();
  await flush();
  edit('JPY', '0.22');
  expect(nodes(render()).some((n) => n.props.testID === 'currency-confirm')).toBe(false);
  await find('currency-review').onPress!();
  await flush();
  const confirm = find('currency-confirm');
  confirm.onPress!();
  confirm.onPress!();
  await flush();
  expect(h.confirm).toHaveBeenCalledOnce();
  expect(h.confirm.mock.calls[0][1]).toEqual({
    operation: 'trip.currency',
    tripId,
    body: {
      base_currency: 'TWD',
      expected_revision: original.revision,
      settings: { default_currency: null, currencies: [{ code: 'JPY', rate: 0.22 }] },
    },
  });
});
it('competing Web settings retain input and require explicit latest review', async () => {
  await mount();
  edit('JPY', '0.23');
  h.request.mockResolvedValue({ ...original, revision: 'f'.repeat(64) });
  await find('currency-review').onPress!();
  await flush();
  expect(h.confirm).not.toHaveBeenCalled();
  expect(find('currency-rate-JPY').value).toBe('0.23');
  find('currency-reconfirm').onPress!();
  await find('currency-review').onPress!();
  await flush();
  await find('currency-confirm').onPress!();
  await flush();
  expect(h.confirm.mock.calls[0][1].body.expected_revision).toBe('f'.repeat(64));
});
it('ordinary members read settings but cannot edit', async () => {
  h.request.mockResolvedValue({ ...original, role: 'member' });
  await mount();
  expect(nodes(render()).some((n) => n.props.testID === 'currency-review')).toBe(false);
  expect(nodes(render()).some((n) => n.props.testID === 'currency-rate-JPY')).toBe(false);
});
it('demotion during review hides admin controls and preserves input for explicit discard', async () => {
  await mount();
  edit('JPY', '0.23');
  h.request.mockResolvedValue({ ...original, role: 'member' });
  await find('currency-review').onPress!();
  await flush();
  expect(nodes(render()).some((n) => n.props.testID === 'currency-confirm')).toBe(false);
  expect(nodes(render()).some((n) => n.props.testID === 'currency-rate-JPY')).toBe(false);
  expect(h.confirm).not.toHaveBeenCalled();
  find('currency-discard').onPress!();
});
it.each(['offline', 'background'])('%s clears prepared confirmation', async (kind) => {
  await mount();
  edit('JPY', '0.23');
  await find('currency-review').onPress!();
  await flush();
  if (kind === 'offline') {
    h.online = false;
    h.connection(false);
  } else h.background('background');
  expect(nodes(render()).some((n) => n.props.testID === 'currency-confirm')).toBe(false);
});
it('reference failure retains exact input and cannot invent a rate', async () => {
  await mount();
  edit('JPY', '0.2156789012345');
  h.request.mockRejectedValueOnce(new ApiError('SERVICE_UNAVAILABLE', 503));
  await find('currency-reference').onPress!();
  await flush();
  expect(find('currency-rate-JPY').value).toBe('0.2156789012345');
  expect(nodes(render()).some((n) => n.props.value === 'rateUnavailable')).toBe(true);
});
it('reference rates use provider publication date without overwriting custom rate', async () => {
  await mount();
  edit('JPY', '0.23');
  h.request.mockResolvedValueOnce({
    rates: { TWD: 1, JPY: 0.2 },
    dates: { JPY: '2026-10-07' },
    provider: 'Frankfurter',
  });
  await find('currency-reference').onPress!();
  await flush();
  expect(find('currency-rate-JPY').value).toBe('0.23');
  expect(nodes(render()).some((n) => n.props.value === '2026-10-07')).toBe(true);
});
it('429 reference request persists account deadline and retains input', async () => {
  await mount();
  edit('JPY', '0.23');
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  await find('currency-reference').onPress!();
  await flush();
  expect(h.pause).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: h.user }),
    expect.any(Number)
  );
  expect(find('currency-rate-JPY').value).toBe('0.23');
});
it('not-sent stays editable; unknown outcome locks until original UUID recovery', async () => {
  await mount();
  edit('JPY', '0.23');
  await find('currency-review').onPress!();
  await flush();
  h.confirm.mockResolvedValueOnce({ kind: 'not-sent' });
  await find('currency-confirm').onPress!();
  await flush();
  expect(find('currency-rate-JPY').editable).toBe(true);
  h.confirm.mockResolvedValueOnce({ kind: 'pending' });
  await find('currency-confirm').onPress!();
  await flush();
  expect(nodes(render()).some((n) => n.props.testID === 'currency-rate-JPY')).toBe(false);
});
it.each(['revoked', 'account'])('late %s response cannot prepare a write', async (kind) => {
  await mount();
  edit('JPY', '0.23');
  let resolve!: (value: TripCurrencyContext) => void;
  h.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  find('currency-review').onPress!();
  await flush();
  if (kind === 'revoked') {
    h.access++;
    h.visible = false;
  } else {
    h.version++;
    h.user = 'd'.repeat(24);
  }
  resolve(original);
  await flush();
  expect(h.confirm).not.toHaveBeenCalled();
  expect(nodes(render()).some((n) => n.props.testID === 'currency-confirm')).toBe(false);
});
it('rejected original input is restored without automatic re-confirmation', async () => {
  h.get.mockResolvedValue({
    status: 'completed',
    tripId,
    result: { status: 'rejected' },
    payload: {
      operation: 'trip.currency',
      body: { settings: { default_currency: 'JPY', currencies: [{ code: 'JPY', rate: 0.23 }] } },
    },
  });
  await mount('request');
  expect(find('currency-rate-JPY').value).toBe('0.23');
  expect(h.confirm).not.toHaveBeenCalled();
});

afterEach(() => vi.useRealTimers());
it.each(['admin', 'member'] as const)(
  'reference values/date/provider are readable by %s without changing settings',
  async (role) => {
    h.request.mockResolvedValueOnce({ ...original, role });
    await mount();
    h.request.mockResolvedValueOnce({
      rates: { TWD: 1, JPY: 0.215 },
      dates: { JPY: '2026-10-07' },
      provider: 'Frankfurter',
    });
    find('currency-reference').onPress!();
    await flush();
    const values = nodes(render()).map((n) => n.props.value);
    expect(values).toContain('0.215');
    expect(values).toContain('2026-10-07');
    expect(values).toContain('Frankfurter');
    expect(h.confirm).not.toHaveBeenCalled();
    if (role === 'member')
      expect(nodes(render()).some((n) => n.props.testID === 'currency-review')).toBe(false);
    else expect(find('currency-rate-JPY').value).toBe('');
  }
);
it('failed 429 persistence blocks reads until the original deadline, without extending it', async () => {
  vi.useFakeTimers();
  const now = Date.now();
  await mount();
  h.pause
    .mockRejectedValueOnce(new Error('disk full'))
    .mockRejectedValueOnce(new Error('disk full'));
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  find('currency-reference').onPress!();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(2);
  const deadline = now + 120000;
  expect(h.pause.mock.calls[0][1]).toBe(deadline);
  vi.setSystemTime(now + 31000);
  find('currency-reference').onPress!();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(2);
  expect(h.pause.mock.calls[1][1]).toBe(deadline);
  find('currency-reference').onPress!();
  await flush();
  expect(h.pause.mock.calls[2][1]).toBe(deadline);
  expect(h.until).toBe(deadline);
  expect(h.request).toHaveBeenCalledTimes(2);
  vi.setSystemTime(deadline - 1);
  find('currency-reference').onPress!();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(2);
  vi.setSystemTime(deadline);
  find('currency-reference').onPress!();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(3);
});
it.each(['offline', 'background', 'input'] as const)(
  'late review cannot restore confirmation after %s; explicit review still works',
  async (kind) => {
    await mount();
    edit('JPY', '0.23');
    let resolve!: (value: TripCurrencyContext) => void;
    h.request.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    find('currency-review').onPress!();
    await flush();
    if (kind === 'offline') {
      h.online = false;
      h.connection(false);
      h.online = true;
      h.connection(true);
    } else if (kind === 'background') {
      h.background('background');
      h.background('active');
    } else edit('JPY', '0.24');
    resolve(original);
    await flush();
    expect(nodes(render()).some((n) => n.props.testID === 'currency-confirm')).toBe(false);
    expect(find('currency-rate-JPY').value).toBe(kind === 'input' ? '0.24' : '0.23');
    expect(find('currency-review').busy).not.toBe(true);
    expect(h.confirm).not.toHaveBeenCalled();
    find('currency-review').onPress!();
    await flush();
    expect(nodes(render()).some((n) => n.props.testID === 'currency-confirm')).toBe(true);
  }
);

it.each(['offline', 'background', 'input'] as const)(
  'review cancelled while SQLite guard waits cannot start HTTP after %s',
  async (kind) => {
    await mount();
    edit('JPY', '0.23');
    let release!: () => void;
    h.retryAt.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const reads = h.request.mock.calls.length;
    find('currency-review').onPress!();
    await flush();
    expect(h.request).toHaveBeenCalledTimes(reads);
    if (kind === 'offline') {
      h.online = false;
      h.connection(false);
      h.online = true;
      h.connection(true);
    } else if (kind === 'background') {
      h.background('background');
      h.background('active');
    } else edit('JPY', '0.24');
    release();
    await flush();
    expect(h.request).toHaveBeenCalledTimes(reads);
    expect(nodes(render()).some((n) => n.props.testID === 'currency-confirm')).toBe(false);
    expect(find('currency-rate-JPY').value).toBe(kind === 'input' ? '0.24' : '0.23');
    expect(find('currency-review').busy).toBe(false);
    expect(h.confirm).not.toHaveBeenCalled();
    find('currency-review').onPress!();
    await flush();
    expect(h.request).toHaveBeenCalledTimes(reads + 1);
    expect(nodes(render()).some((n) => n.props.testID === 'currency-confirm')).toBe(true);
  }
);
