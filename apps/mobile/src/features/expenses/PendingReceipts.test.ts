import { expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { PendingReceipts } from './PendingReceipts';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  i: 0,
  focus: () => () => {},
  user: 'a',
  list: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.i++;
    if (!(i in h.values)) h.values[i] = initial;
    return [
      h.values[i],
      (v: unknown) => {
        h.values[i] = v;
      },
    ];
  },
  useCallback: (fn: unknown) => fn,
}));
vi.mock('expo-router', () => ({
  router: { push: vi.fn() },
  useFocusEffect: (fn: typeof h.focus) => {
    h.focus = fn;
  },
}));
vi.mock('@/components/ui', () => ({ Action: 'Action', Notice: 'Notice', Section: 'Section' }));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => ({ receipts: 'receipt', receiptPending: 'pending' }),
}));
vi.mock('@/features/tripEntry/provider', () => ({
  useTripEntry: () => ({ scope: { environment: 'test', accountId: h.user } }),
}));
vi.mock('@/storage/receiptWriteDatabase', () => ({
  openReceiptWriteStore: async () => ({ list: h.list }),
}));
function nodes(value: ReactNode): ReactElement<{ children?: ReactNode; onPress?: unknown }>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement(value)) return [];
  const n = value as ReactElement<{ children?: ReactNode; onPress?: unknown }>;
  return [n, ...nodes(n.props.children)];
}
function actions() {
  h.i = 0;
  return nodes(PendingReceipts()).filter((n) => n.props.onPress);
}
it('hides old account recovery links immediately, before the next focus effect runs', async () => {
  h.list.mockResolvedValue([
    { tripId: 'trip-a', expenseId: 'expense-a', input: { client_request_id: 'uuid' } },
  ]);
  actions();
  h.focus();
  await new Promise((r) => setTimeout(r, 0));
  expect(actions()).toHaveLength(1);
  h.user = 'b';
  expect(actions()).toHaveLength(0);
});
