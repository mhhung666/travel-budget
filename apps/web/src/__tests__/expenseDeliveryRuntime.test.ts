// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { mongo } from 'mongoose';
const mocks = vi.hoisted(() => ({
  env: vi.fn(),
  connect: vi.fn(),
  events: vi.fn(),
  worker: vi.fn(),
  push: vi.fn(),
  info: vi.fn(),
}));
vi.mock('@/lib/env', () => ({ getEnv: mocks.env, getWebPushConfig: mocks.push }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: mocks.connect }));
vi.mock('@/lib/expenseEventStore', () => ({ createExpenseEventStore: mocks.events }));
vi.mock('@/lib/expenseDeliveryWorker', () => ({ createExpenseDeliveryWorker: mocks.worker }));
vi.mock('@/lib/logger', () => ({ logger: { info: mocks.info } }));
import {
  assertExpenseDeliveryReady,
  prepareExpenseBackgroundWrite,
  runExpenseBackgroundDelivery,
} from '@/lib/expenseDeliveryRuntime';
function database() {
  const command = vi.fn().mockResolvedValue({ setName: 'rs' });
  const listIndexes = vi.fn().mockReturnValue({
    toArray: async () => [
      {
        name: 'expense_delivery_ready',
        key: { 'expenseDelivery.status': 1, 'expenseDelivery.availableAt': 1 },
      },
      { name: 'expense_push_candidates', key: { user: 1, _id: 1 } },
    ],
  });
  const db = {
    admin: () => ({ command }),
    collection: () => ({ listIndexes }),
  } as unknown as mongo.Db;
  return { db, command, listIndexes };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.mockReturnValue({ EXPENSE_BACKGROUND_DELIVERY: 'off' });
  mocks.events.mockResolvedValue({});
});
describe('expense delivery rollout gates', () => {
  it('off never connects or verifies indexes', async () => {
    expect(await prepareExpenseBackgroundWrite()).toBe(false);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('requires recovery authentication before allowing new outbox writes', async () => {
    mocks.env.mockReturnValue({ EXPENSE_BACKGROUND_DELIVERY: 'on' });
    await expect(prepareExpenseBackgroundWrite()).rejects.toThrow('authentication');
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('coalesces readiness per database and does not create indexes', async () => {
    const { db, command, listIndexes } = database();
    await Promise.all(Array.from({ length: 8 }, () => assertExpenseDeliveryReady(db)));
    expect(command).toHaveBeenCalledOnce();
    expect(mocks.events).toHaveBeenCalledOnce();
    expect(listIndexes).toHaveBeenCalledTimes(2);
  });
  it('rejects incompatible indexes and permits a new readiness attempt after repair', async () => {
    const { db, listIndexes } = database();
    listIndexes.mockReturnValueOnce({ toArray: async () => [] });
    await expect(assertExpenseDeliveryReady(db)).rejects.toThrow('index');
    await expect(assertExpenseDeliveryReady(db)).resolves.toBeUndefined();
  });
  it('rejects non-transaction databases and missing unique indexes', async () => {
    const { db, command } = database();
    command.mockResolvedValueOnce({});
    await expect(assertExpenseDeliveryReady(db)).rejects.toThrow('Transactions');
    mocks.events.mockRejectedValueOnce(new Error('dedupe missing'));
    await expect(assertExpenseDeliveryReady(db)).rejects.toThrow('dedupe');
  });
  it('allows prepared writes only after validating the connected target', async () => {
    const { db } = database();
    mocks.connect.mockResolvedValue({ connection: { db } });
    mocks.env.mockReturnValue({ EXPENSE_BACKGROUND_DELIVERY: 'on', CRON_SECRET: 'test' });
    expect(await prepareExpenseBackgroundWrite()).toBe(true);
  });
  it('can drain with flag off and logs only the status', async () => {
    const { db } = database();
    mocks.connect.mockResolvedValue({ connection: { db } });
    mocks.push.mockReturnValue(null);
    const run = vi.fn().mockResolvedValue({ status: 'done' });
    mocks.worker.mockResolvedValue(run);
    expect(await runExpenseBackgroundDelivery()).toEqual({ status: 'done' });
    expect(mocks.worker).toHaveBeenCalledWith(db, { config: null });
    expect(run).toHaveBeenCalledOnce();
    expect(mocks.info).toHaveBeenCalledExactlyOnceWith('Expense delivery batch', {
      status: 'done',
    });
  });
});
