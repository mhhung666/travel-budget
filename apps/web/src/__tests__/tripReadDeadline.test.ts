// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
import { withTripReadInDatabase } from '@/lib/tripWriteTransaction';
const h = vi.hoisted(() => ({ clock: 0, budgets: [] as number[], validate: vi.fn() }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/ledger', () => ({ authorizeLedger: vi.fn(), validateLedgerChildren: h.validate }));
const id = 'a'.repeat(24);
beforeEach(() => {
  vi.resetAllMocks();
  h.clock = 0;
  h.budgets = [];
  vi.spyOn(performance, 'now').mockImplementation(() => h.clock);
  h.validate.mockImplementation(async (_db, _parent, _session, options) => {
    if (options) {
      h.budgets.push(options().timeoutMS);
      h.clock += 3000;
      h.budgets.push(options().timeoutMS);
      h.clock += 2000;
    }
  });
});
afterEach(() => vi.restoreAllMocks());
function database() {
  const session = {
    withTransaction: vi.fn(async (fn: () => Promise<unknown>, _options: unknown) => fn()),
    inTransaction: () => true,
    commitTransaction: vi.fn(async () => {}),
    abortTransaction: vi.fn(async () => {}),
  };
  const findOne = vi.fn(async (_filter, options) => {
    if (options.timeoutMS) h.budgets.push(options.timeoutMS);
    h.clock += 2000;
    return { _id: new mongo.ObjectId(id), members: [] };
  });
  const db = {
    client: { withSession: async (fn: (s: unknown) => unknown) => fn(session) },
    collection: () => ({ findOne }),
  } as unknown as mongo.Db;
  return { db, session };
}
it('all cursor operations and commit share the remaining 20-second budget, without transaction CSOT on getMore', async () => {
  const { db, session } = database();
  const result = await withTripReadInDatabase(
    db,
    id,
    id,
    async (_session, options) => {
      h.budgets.push(options().timeoutMS!);
      h.clock += 1000;
      return 'complete';
    },
    true
  );
  expect(result).toBe('complete');
  expect(h.budgets).toEqual([20000, 18000, 15000, 13000]);
  expect(session.commitTransaction).toHaveBeenCalledWith({ timeoutMS: 12000 });
  expect(session.withTransaction.mock.calls[0][1]).toEqual({
    readConcern: { level: 'snapshot' },
    readPreference: 'primary',
  });
});
it('a slow read cannot start commit or reset its deadline; timeout aborts with a bounded cleanup', async () => {
  const { db, session } = database();
  await expect(
    withTripReadInDatabase(
      db,
      id,
      id,
      async () => {
        h.clock = 20001;
        return 'too late';
      },
      true
    )
  ).rejects.toBeInstanceOf(mongo.MongoOperationTimeoutError);
  expect(session.commitTransaction).not.toHaveBeenCalled();
  expect(session.abortTransaction).toHaveBeenCalledWith({ timeoutMS: 1 });
});
it('retrying the snapshot reuses the original deadline rather than granting another 20 seconds', async () => {
  const { db, session } = database();
  session.withTransaction.mockImplementationOnce(async (fn) => {
    try {
      await fn();
    } catch {
      /* retry transient snapshot */
    }
    return fn();
  });
  let attempt = 0;
  await withTripReadInDatabase(
    db,
    id,
    id,
    async (_session, options) => {
      h.budgets.push(options().timeoutMS!);
      if (!attempt++) {
        h.clock += 1000;
        throw new mongo.MongoServerError({ message: 'retry' });
      }
      return 'complete';
    },
    true
  );
  expect(h.budgets).toEqual([20000, 18000, 15000, 13000, 12000, 10000, 7000, 5000]);
  expect(session.commitTransaction).toHaveBeenCalledWith({ timeoutMS: 5000 });
});
it('other read services retain their existing snapshot transaction timeout and automatic commit', async () => {
  const { db, session } = database();
  await withTripReadInDatabase(db, id, id, async (_session, options) => {
    expect(options()).toEqual({ session });
    return 'same';
  });
  expect(session.withTransaction.mock.calls[0][1]).toEqual({
    readConcern: { level: 'snapshot' },
    readPreference: 'primary',
    timeoutMS: 20000,
  });
  expect(session.commitTransaction).not.toHaveBeenCalled();
});
