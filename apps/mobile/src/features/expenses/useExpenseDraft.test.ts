import { afterEach, expect, it, vi } from 'vitest';
import type { ExpenseOptions } from '@/api/contracts';
import { createPendingExpenseStore } from '@/storage/pendingExpenses';
import { memoryDatabase } from '@/test/sqlite';
import { hex, uuidOf } from '@/test/expenseServer';
import { validateDraft } from './draft';
import { useExpenseDraft } from './useExpenseDraft';

const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void)[],
  open: vi.fn(),
}));
// Retain the mounted hook's state/ref slots across prop updates, then run commit effects.
// Native adapters and React mounting are mocked; draft editing/persistence use real SQLite.
vi.mock('react', () => {
  const slot = (create: () => unknown) => {
    const index = lifecycle.cursor++;
    if (!(index in lifecycle.slots)) lifecycle.slots[index] = create();
    return lifecycle.slots[index];
  };
  return {
    useState: (create: () => unknown) => [slot(create), vi.fn()],
    useRef: (current: unknown) => slot(() => ({ current })),
    useEffect: (effect: () => void) => lifecycle.effects.push(effect),
    useLayoutEffect: (effect: () => void) => lifecycle.effects.push(effect),
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  };
});
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: vi.fn() }) } }));
vi.mock('expo-crypto', () => ({ randomUUID: vi.fn() }));
vi.mock('@/storage/pendingExpenseDatabase', () => ({ openPendingExpenseStore: lifecycle.open }));

const scope = { environment: 'https://a.test', accountId: hex(1) };
const tripId = hex(100);
const initialOptions: ExpenseOptions = {
  members: [
    { id: hex(1), displayName: 'Me' },
    { id: hex(2), displayName: 'Leaving' },
  ],
  categories: ['food', 'other'],
};
const latestOptions: ExpenseOptions = {
  ...initialOptions,
  members: [
    { id: hex(1), displayName: 'Me' },
    { id: hex(3), displayName: 'Joined' },
  ],
};
let close: (() => void) | undefined;
afterEach(() => {
  close?.();
  lifecycle.slots = [];
  lifecycle.effects = [];
  lifecycle.cursor = 0;
  vi.clearAllMocks();
});
function DraftHarness(options: ExpenseOptions) {
  return useExpenseDraft(scope, tripId, options);
}
function renderDraft(options: ExpenseOptions) {
  lifecycle.cursor = 0;
  const hook = DraftHarness(options);
  lifecycle.effects.splice(0).forEach((effect) => effect());
  return hook;
}

it('discard after refreshed member options creates and saves a new draft using the latest list', async () => {
  const db = memoryDatabase();
  close = () => db.close();
  const store = await createPendingExpenseStore(db);
  lifecycle.open.mockResolvedValue(store);
  const { randomUUID } = await import('expo-crypto');
  vi.mocked(randomUUID).mockReturnValueOnce(uuidOf(1)).mockReturnValueOnce(uuidOf(2));

  const first = renderDraft(initialOptions);
  await first.editor.flush();
  const original = first.editor.getSnapshot().record!;
  const refreshed = renderDraft(latestOptions);
  expect(refreshed.editor).toBe(first.editor);
  // Refreshing options must not silently change the existing draft's selected members.
  expect(refreshed.editor.getSnapshot().record).toEqual(original);

  await refreshed.editor.discard();
  const next = await refreshed.editor.flush();
  expect(next.draftId).not.toBe(original.draftId);
  expect(next.input.memberIds).toEqual([hex(1), hex(3)]);
  expect(next.input.payerId).toBe(hex(1));
  expect(
    validateDraft({ ...next.input, description: 'Dinner', amountText: '100' }, latestOptions)
  ).toEqual([]);
  expect(await store.drafts.load(scope, tripId)).toEqual(next);
});
