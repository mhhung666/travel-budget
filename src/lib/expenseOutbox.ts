import { get, update, del } from 'idb-keyval';
import type { Expense } from '@/types';
import type { QueryClient } from '@tanstack/react-query';
import type { CreateExpenseVars, ExpenseCreateContext } from './offlineMutations';

export interface ExpenseOutboxEntry {
  vars: CreateExpenseVars;
  context?: ExpenseCreateContext;
  status: 'pending' | 'failed' | 'done';
  error?: string;
  createdAt: number;
  updatedAt?: number;
  expense?: Expense;
}
export type ExpenseOutbox = Record<string, ExpenseOutboxEntry>;
const cleared = new WeakSet<QueryClient>();
const bindings = new WeakMap<QueryClient, ReturnType<typeof createExpenseOutbox>>();
export const expenseOutboxQueryKey = ['expenseOutbox'] as const;
export const getExpenseOutboxKey = (scope: string) =>
  `travel-budget-expense-outbox:${encodeURIComponent(scope)}`;

/** Atomic read-modify-write keeps submissions in separate tabs from overwriting each other. */
export function createExpenseOutbox(scope: string) {
  const key = getExpenseOutboxKey(scope);
  return {
    read: async (): Promise<ExpenseOutbox> => (await get(key)) ?? {},
    write: async (entry: ExpenseOutboxEntry) => {
      const id = entry.vars.input.client_request_id;
      if (!id) throw new Error('Missing expense request ID');
      await update<ExpenseOutbox>(key, (entries = {}) => ({
        ...entries,
        [id]:
          entries[id]?.status === 'done'
            ? entries[id]
            : { ...entry, createdAt: entries[id]?.createdAt ?? entry.createdAt },
      }));
    },
    clear: async () => del(key),
  };
}
export function bindExpenseOutbox(client: QueryClient, scope: string) {
  const outbox = createExpenseOutbox(scope);
  bindings.set(client, outbox);
  return outbox;
}
export async function saveExpenseOutbox(
  client: QueryClient,
  vars: CreateExpenseVars,
  context: ExpenseCreateContext | undefined,
  status: ExpenseOutboxEntry['status'],
  error?: string,
  expense?: Expense
) {
  if (cleared.has(client)) throw new Error('Expense request was cleared');
  const outbox = bindings.get(client);
  if (!outbox) return; // Standalone QueryClients used outside the persisted application provider.
  await outbox.write({
    vars,
    context,
    status,
    error,
    expense,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const entries = await outbox.read();
  if (cleared.has(client)) throw new Error('Expense request was cleared');
  client.setQueryData(expenseOutboxQueryKey, entries);
}
export async function clearExpenseOutbox(client: QueryClient) {
  cleared.add(client);
  await bindings.get(client)?.clear();
}
