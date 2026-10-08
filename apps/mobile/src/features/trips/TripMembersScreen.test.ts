import { beforeEach, expect, it, vi } from 'vitest';
import { TripMembersScreen } from './TripMembersScreen';
import { ApiError } from '@/api/client';
import type { TripMembers } from '@travel-budget/contracts';
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
const original: TripMembers = {
  tripId,
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
function render(source?: string) {
  h.i = h.j = 0;
  return TripMembersScreen({ tripId, source });
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
async function mount(source?: string) {
  render(source);
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
      operation: 'member.create',
      resourceId: memberId,
      result: { tripId, memberId, revision: 'e'.repeat(64) },
    },
  });
});
it('create reviews a fresh roster, changes cancel preparation, duplicate taps submit once', async () => {
  await mount();
  await press('member-create');
  find('member-name').onChangeText!(' New virtual ');
  await press('members-check');
  expect(has('members-confirm')).toBe(true);
  find('member-name').onChangeText!('Changed');
  expect(has('members-confirm')).toBe(false);
  await press('members-check');
  const confirm = find('members-confirm').onPress!;
  confirm();
  confirm();
  await flush();
  expect(h.confirm).toHaveBeenCalledTimes(1);
  expect(h.confirm).toHaveBeenCalledWith(expect.anything(), {
    operation: 'member.create',
    tripId,
    body: { expected_revision: original.revision, display_name: 'Changed' },
  });
  expect(has('member-create')).toBe(false);
  expect(has('members-confirm')).toBe(false);
});
it('rename targets the original ID, not a display name; unchanged and blank names cannot prepare', async () => {
  await mount();
  await press(`member-rename-${memberId}`);
  await press('members-check');
  expect(has('members-confirm')).toBe(false);
  find('member-name').onChangeText!('  ');
  await press('members-check');
  expect(has('members-confirm')).toBe(false);
  find('member-name').onChangeText!(' Renamed ');
  await press('members-check');
  await press('members-confirm');
  expect(h.confirm).toHaveBeenCalledWith(expect.anything(), {
    operation: 'member.rename',
    tripId,
    memberId,
    body: { expected_revision: original.revision, display_name: 'Renamed' },
  });
});
it('roster conflict preserves input, requires explicit latest acceptance and another review', async () => {
  await mount();
  await press('member-create');
  find('member-name').onChangeText!('Input');
  const changed = { ...original, revision: 'e'.repeat(64) };
  h.request.mockResolvedValue(changed);
  await press('members-check');
  expect(has('members-confirm')).toBe(false);
  expect(find('member-name').value).toBe('Input');
  expect(find('member-name').editable).toBe(false);
  await press('members-reconfirm');
  expect(find('member-name').value).toBe('Input');
  expect(has('members-confirm')).toBe(false);
  await press('members-check');
  await press('members-confirm');
  expect(h.confirm.mock.calls[0][1].body.expected_revision).toBe(changed.revision);
});
it.each(['member', 'claim'] as const)(
  '%s change cancels editing after explicit latest acceptance',
  async (kind) => {
    await mount();
    await press(`member-rename-${memberId}`);
    find('member-name').onChangeText!('Desired');
    h.request.mockResolvedValue({
      ...original,
      ...(kind === 'member'
        ? { role: 'member' }
        : { members: original.members.map((m) => ({ ...m, isVirtual: false })) }),
      revision: 'e'.repeat(64),
    });
    await press('members-check');
    await press('members-reconfirm');
    expect(has('member-name')).toBe(false);
    expect(h.confirm).not.toHaveBeenCalled();
  }
);
it('ordinary members have a read-only roster and no create or rename controls', async () => {
  h.request.mockResolvedValue({ ...original, role: 'member' });
  await mount();
  expect(has('member-create')).toBe(false);
  expect(has(`member-rename-${memberId}`)).toBe(false);
});
it('unknown outcome freezes editing and sends the user to original-operation recovery', async () => {
  await mount();
  await press('member-create');
  find('member-name').onChangeText!('Virtual');
  await press('members-check');
  h.confirm.mockResolvedValue({ kind: 'pending' });
  await press('members-confirm');
  expect(has('member-name')).toBe(false);
  expect(has('members-cancel')).toBe(false);
  expect(has('members-operations')).toBe(true);
});
it('persisted 429 prevents reads and HTTP 429 saves its original wait', async () => {
  h.until = Date.now() + 120000;
  await mount();
  expect(h.request).not.toHaveBeenCalled();
  h.until = 0;
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  await press('members-load');
  expect(h.pause).toHaveBeenCalledWith(expect.anything(), expect.any(Number));
});
it('late responses after account change or catalog denial cannot reveal or prepare the roster', async () => {
  let resolve!: (data: TripMembers) => void;
  h.request.mockReturnValue(
    new Promise<TripMembers>((r) => {
      resolve = r;
    })
  );
  await mount();
  h.access++;
  h.visible = false;
  resolve(original);
  await flush();
  expect(has('member-create')).toBe(false);
  expect(has(`member-rename-${memberId}`)).toBe(false);
  expect(h.confirm).not.toHaveBeenCalled();
});
it('offline/background clears preparation and requires a new review', async () => {
  await mount();
  await press('member-create');
  find('member-name').onChangeText!('Virtual');
  await press('members-check');
  h.background('background');
  expect(has('members-confirm')).toBe(false);
});
it('rejected rename restores only this trip and a still-virtual target, with a fresh roster revision', async () => {
  h.get.mockResolvedValue({
    status: 'completed',
    tripId,
    result: { status: 'rejected' },
    payload: { operation: 'member.rename', memberId, body: { display_name: 'Restored' } },
  });
  await mount('original-uuid');
  expect(find('member-name').value).toBe('Restored');
  await press('members-check');
  expect(has('members-confirm')).toBe(true);
});
