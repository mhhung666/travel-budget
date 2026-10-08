import { beforeEach, expect, it, vi } from 'vitest';
import { TripAccessScreen } from './TripAccessScreen';
import { ApiError } from '@/api/client';
import type { TripAccessContext } from '@travel-budget/contracts';
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
  useMemo: (fn: () => unknown) => fn(),
  useRef: (initial: unknown) => (h.refs[h.j++] ??= { current: initial }),
  useEffect: (fn: () => (() => void) | void) => h.effects.push(fn),
}));
vi.mock('react-native', () => ({
  Share: { share: vi.fn() },
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
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }));
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: h.prevent }));
vi.mock('@/components/screen', () => ({ FormPage: 'FormPage' }));
vi.mock('@/components/navigation', () => ({ goBack: vi.fn() }));
vi.mock('@/components/ui', () =>
  Object.fromEntries(
    ['Action', 'Card', 'Copy', 'DetailRow', 'Notice', 'Section', 'TextField'].map((n) => [n, n])
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
    retryAt: async () => h.until,
    rateLimitUntil: () => h.until,
    get: h.get,
    pause: h.pause,
  }),
}));
vi.mock('@/i18n/useDisplayFormat', () => ({ useDisplayFormat: () => ({ instant: String }) }));
vi.mock('./managementRefresh', () => ({ refreshManagedTrip: h.refresh }));
const tripId = 'b'.repeat(24),
  memberId = 'd'.repeat(24);
const original: TripAccessContext = {
  tripId,
  name: 'Trip',
  accessRevision: 'c'.repeat(64),
  expenseCount: 1,
  paymentCount: 1,
  canLeave: false,
  role: 'admin',
  revision: 'c'.repeat(64),
  members: [
    { id: 'a'.repeat(24), displayName: 'Alice', isVirtual: false, role: 'admin', joinedAt: null },
    { id: memberId, displayName: 'Virtual', isVirtual: true, role: 'member', joinedAt: null },
  ],
};
type Props = {
  testID?: string;
  disabled?: boolean;
  editable?: boolean;
  value?: string;
  children?: unknown;
  onPress?: () => unknown;
  onChangeText?: (value: string) => void;
};
function render() {
  h.i = h.j = 0;
  return TripAccessScreen({ tripId });
}
function nodes(node: unknown): { props: Props }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const item = node as { props: Props };
  return [item, ...nodes(item.props.children)];
}
function find(id: string) {
  const node = nodes(render()).find((n) => n.props.testID === id);
  if (!node) throw new Error(`Missing ${id}`);
  return node.props;
}
const has = (id: string) => nodes(render()).some((n) => n.props.testID === id);
async function flush() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function mount() {
  render();
  const cleanup = h.effects[0]();
  await flush();
  return cleanup;
}
async function press(id: string) {
  await find(id).onPress!();
  await flush();
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
  h.user = 'a'.repeat(24);
  h.request.mockImplementation(async (_actor, _path, _schema, options) => {
    options?.beforeSend?.();
    return original;
  });
  h.confirm.mockResolvedValue({
    kind: 'completed',
    result: {
      status: 'committed',
      operation: 'trip.access',
      resourceId: tripId,
      result: { tripId, action: 'remove', exited: false },
    },
  });
});

it('management reviews fresh data, no implicit write, double confirmation sends once', async () => {
  await mount();
  await press(`access-remove-${memberId}`);
  expect(h.confirm).not.toHaveBeenCalled();
  expect(has('access-confirm')).toBe(true);
  const confirm = find('access-confirm').onPress!;
  confirm();
  confirm();
  await flush();
  expect(h.confirm).toHaveBeenCalledTimes(1);
  expect(h.confirm).toHaveBeenCalledWith(expect.anything(), {
    operation: 'trip.access',
    tripId,
    body: { action: 'remove', member_id: memberId, expected_revision: original.accessRevision },
  });
  expect(has('access-done')).toBe(true);
});
it('role chooses original member ID and review cancel sends nothing', async () => {
  await mount();
  await press(`access-role-${memberId}`);
  await press('access-cancel');
  expect(has('access-confirm')).toBe(false);
  expect(h.confirm).not.toHaveBeenCalled();
  await press(`access-role-${memberId}`);
  await press('access-confirm');
  expect(h.confirm.mock.calls[0][1].body).toMatchObject({
    action: 'role',
    member_id: memberId,
    role: 'admin',
  });
});
it('new accounting invalidates the review and requires an explicit second choice', async () => {
  await mount();
  const changed = { ...original, accessRevision: 'e'.repeat(64), expenseCount: 2 };
  h.request.mockResolvedValue(changed);
  await press('access-delete');
  expect(has('access-confirm')).toBe(false);
  await press('access-delete');
  expect(has('access-confirm')).toBe(true);
  await press('access-confirm');
  expect(h.confirm.mock.calls[0][1].body.expected_revision).toBe(changed.accessRevision);
});
it('ordinary members can leave, with no role/remove/delete/claim buttons', async () => {
  h.request.mockResolvedValue({ ...original, role: 'member', canLeave: true });
  await mount();
  expect(has('access-delete')).toBe(false);
  expect(has(`access-remove-${memberId}`)).toBe(false);
  expect(has(`access-role-${memberId}`)).toBe(false);
  expect(has(`access-claim-${memberId}`)).toBe(false);
  await press('access-leave');
  expect(has('access-confirm')).toBe(true);
});
it('last usable admin cannot prepare leaving', async () => {
  await mount();
  expect(find('access-leave').disabled).toBe(true);
  await press('access-leave');
  expect(has('access-confirm')).toBe(false);
});
it('exit committed result remains visible after catalog hides the trip', async () => {
  await mount();
  await press('access-delete');
  h.confirm.mockImplementation(async () => {
    h.visible = false;
    h.access++;
    return {
      kind: 'completed',
      result: {
        status: 'committed',
        operation: 'trip.access',
        resourceId: tripId,
        result: { tripId, action: 'delete', exited: true },
      },
    };
  });
  await press('access-confirm');
  expect(has('access-done')).toBe(true);
  expect(has('access-confirm')).toBe(false);
});
it('lost acknowledgement freezes management and offers original operation lookup', async () => {
  await mount();
  await press('access-delete');
  h.confirm.mockResolvedValue({ kind: 'pending' });
  await press('access-confirm');
  expect(has('access-operations')).toBe(true);
  expect(has('access-delete')).toBe(false);
});
it('background invalidates confirmation; persisted and HTTP 429 block all reads', async () => {
  await mount();
  await press('access-delete');
  h.background('background');
  expect(has('access-confirm')).toBe(false);
  h.until = Date.now() + 120000;
  h.request.mockClear();
  await press('access-refresh');
  expect(h.request).not.toHaveBeenCalled();
  h.until = 0;
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  await press('access-refresh');
  expect(h.pause).toHaveBeenCalled();
});
it('late roster after account change or denial cannot prepare destructive actions', async () => {
  let resolve!: (data: TripAccessContext) => void;
  h.request.mockReturnValue(
    new Promise<TripAccessContext>((r) => {
      resolve = r;
    })
  );
  await mount();
  h.access++;
  h.visible = false;
  resolve(original);
  await flush();
  expect(has('access-delete')).toBe(false);
  expect(h.confirm).not.toHaveBeenCalled();
});
it('claim invitation comes from authorized endpoint and contains no credentials in persisted operations', async () => {
  await mount();
  h.request.mockResolvedValue({ url: 'https://test/link-virtual/code/virtual_id' });
  await press(`access-claim-${memberId}`);
  expect(h.request.mock.calls[1][1]).toBe(`/trips/${tripId}/members/${memberId}/claim-invitation`);
  expect(has('access-copy-claim')).toBe(true);
  expect(h.confirm).not.toHaveBeenCalled();
});
