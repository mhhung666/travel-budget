import { memoryDatabase } from '@/test/sqlite';
import { createReceiptWriteStore, type ReceiptWriteStore } from '@/storage/receiptWrites';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReceiptWriteScreen } from './ReceiptWriteScreen';
import { ApiError } from '@/api/client';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  i: 0,
  focus: (() => () => {}) as () => () => void,
  request: vi.fn(),
  open: vi.fn(async () => {}),
  pick: vi.fn(),
  removeFile: vi.fn(async () => {}),
  store: null as ReceiptWriteStore | null,
  appState: 'active',
  change: (_state: string) => {},
  pause: vi.fn(),
  retryAt: vi.fn(),
  online: true,
  visible: true,
  version: 1,
  access: 1,
  until: 0,
  user: 'a'.repeat(24),
  environment: 'https://test/api/v1',
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
    const i = h.i++;
    if (!(i in h.values)) h.values[i] = { current: initial };
    return h.values[i];
  },
  useCallback: (fn: unknown) => fn,
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
vi.mock('@/storage/receiptWriteDatabase', () => ({ openReceiptWriteStore: async () => h.store }));
vi.mock('./receiptFiles', () => ({
  pickReceipt: h.pick,
  removeReceiptFile: h.removeFile,
  uploadReceiptFile: vi.fn(),
  cleanupReceiptFiles: vi.fn(async () => {}),
}));
vi.mock('react-native', () => ({
  Image: 'Image',
  ScrollView: 'ScrollView',
  Linking: { openURL: h.open },
  FlatList: 'FlatList',
  View: 'View',
  Keyboard: { dismiss: vi.fn() },
  AppState: {
    get currentState() {
      return h.appState;
    },
    addEventListener: (_event: string, fn: typeof h.change) => {
      h.change = fn;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (fn: typeof h.focus) => {
    h.focus = fn;
  },
  router: { push: vi.fn() },
}));
vi.mock('@/components/frame', () => ({ ScreenFrame: 'ScreenFrame' }));
vi.mock('@/components/screen', () => ({ PageHeader: 'PageHeader' }));
vi.mock('@/components/navigation', () => ({ goBack: vi.fn() }));
vi.mock('@/components/Disclosure', () => ({ Disclosure: 'Disclosure' }));
vi.mock('@/features/navigation/TripContext', () => ({ TripContext: 'TripContext' }));
vi.mock('./ExpenseRow', () => ({ ExpenseRow: 'ExpenseRow' }));
vi.mock('@/components/ui', () => ({
  ...Object.fromEntries(
    ['Action', 'Card', 'Chip', 'Copy', 'DetailRow', 'Notice', 'Section', 'TextField', 'Page'].map(
      (n) => [n, n]
    )
  ),
  styles: { page: {} },
}));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => new Proxy({}, { get: (_t, k) => String(k) }),
}));
vi.mock('@/i18n/useDisplayFormat', () => ({
  useDisplayFormat: () => ({ money: (n: number) => `USD ${n}`, date: (d: string) => d }),
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('@tanstack/react-query', () => ({ onlineManager: { isOnline: () => h.online } }));
vi.mock('@/features/tripEntry/provider', () => ({
  useTripEntry: () => ({
    scope: { environment: h.environment, accountId: 'a'.repeat(24) },
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
    pause: h.pause,
  }),
}));

const trip = 'b'.repeat(24),
  expense = 'c'.repeat(24),
  id = 'd'.repeat(64);
const metadata = { id, contentType: 'image/png', size: 123 };
const result = { ledger: { baseCurrency: 'TWD', moneyScale: 2 }, items: [metadata] };
type Node = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function nodes(value: ReactNode): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement(value)) return [];
  const n = value as Node;
  return [n, ...nodes(n.props.children)];
}
function render() {
  h.i = 0;
  return ReceiptWriteScreen({ tripId: trip, expenseId: expense });
}
function find(label: string) {
  return nodes(render()).find((n) => n.props.label === label);
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
let database: ReturnType<typeof memoryDatabase>;
afterEach(() => database.close());
beforeEach(async () => {
  database = memoryDatabase();
  h.store = await createReceiptWriteStore(database);
  h.pick.mockResolvedValue({
    file: '11111111-1111-4111-8111-111111111111',
    contentType: 'image/jpeg',
    size: 100,
  });
  vi.clearAllMocks();
  h.values = [];
  h.i = 0;
  h.online = true;
  h.visible = true;
  h.version = 1;
  h.access = 1;
  h.until = 0;
  h.user = 'a'.repeat(24);
  h.appState = 'active';
  h.retryAt.mockResolvedValue(0);
  h.pause.mockImplementation(async (_scope, until) => {
    h.until = Math.max(h.until, until);
  });
  h.request.mockImplementation(async (_account, path: string, _schema, options) => {
    options.beforeSend();
    return path.endsWith('/attachments')
      ? result
      : {
          ...metadata,
          ledger: result.ledger,
          url: 'https://receipts.test/file',
          expiresAt: Date.now() + 300000,
        };
  });
});

it('selection never sends a write until confirmation; blur cleans only unconfirmed files', async () => {
  render();
  const blur = h.focus();
  await settle();
  (find('receiptChoose')!.props.onPress as () => void)();
  await settle();
  expect(find('receiptConfirm')).toBeDefined();
  expect(h.request.mock.calls.every((c) => !c[3].method)).toBe(true);
  expect(await h.store!.list({ environment: h.environment, accountId: h.user })).toEqual([]);
  blur();
  expect(h.removeFile).toHaveBeenCalledTimes(1);
});
it('hands file ownership to durable recovery before network and retains it after a lost response', async () => {
  render();
  const blur = h.focus();
  await settle();
  (find('receiptChoose')!.props.onPress as () => void)();
  await settle();
  h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
  (find('receiptConfirm')!.props.onPress as () => void)();
  await settle();
  const records = await h.store!.list({ environment: h.environment, accountId: h.user });
  expect(records).toHaveLength(1);
  expect(records[0].file).toBeTruthy();
  blur();
  expect(h.removeFile).not.toHaveBeenCalled();
  expect(records[0].result).toBeNull();
});
it('requires confirmation for removal and hides actions after switching accounts', async () => {
  render();
  h.focus();
  await settle();
  (find('receiptRemove')!.props.onPress as () => void)();
  await settle();
  expect(find('receiptConfirm')).toBeDefined();
  expect(h.request.mock.calls.every((c) => !c[3].method)).toBe(true);
  h.user = 'f'.repeat(24);
  expect(find('receiptConfirm')).toBeUndefined();
});
it('rejects a late picker result after navigation and deletes its private copy', async () => {
  let resolve!: (value: unknown) => void;
  h.pick.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  render();
  const blur = h.focus();
  await settle();
  (find('receiptChoose')!.props.onPress as () => void)();
  await settle();
  blur();
  resolve({ file: '11111111-1111-4111-8111-111111111111', contentType: 'image/jpeg', size: 100 });
  await settle();
  expect(h.removeFile).toHaveBeenCalledTimes(1);
  expect(await h.store!.files()).toEqual([]);
});
it('keeps the selected file if navigation races the durable confirmation write', async () => {
  render();
  const blur = h.focus();
  await settle();
  (find('receiptChoose')!.props.onPress as () => void)();
  await settle();
  const original = h.store!.insert;
  let release!: () => void;
  h.store!.insert = async (...args) => {
    await new Promise<void>((r) => {
      release = r;
    });
    await original(...args);
  };
  (find('receiptConfirm')!.props.onPress as () => void)();
  await settle();
  blur();
  release();
  await settle();
  expect(await h.store!.files()).toEqual(['11111111-1111-4111-8111-111111111111']);
  expect(h.removeFile).not.toHaveBeenCalled();
  expect(h.request.mock.calls.every((c) => !c[3].method)).toBe(true);
});
