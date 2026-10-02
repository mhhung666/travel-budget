// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { roundMoney, normalizeShares } from '../lib/money';
import { readSettlement } from '../lib/settlementRead';
import { readTripShell } from '../lib/tripShellRead';
import { up, down } from '../../migrations/20260916220000-normalize-expense-money.js';
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => {} }));

// 與 moneyAggregation.integration.test.ts 相同閘門：只在明確提供的測試伺服器、全新資料庫寫入。
const uri = process.env.MONGODB_QUEUE_TEST_URI;
const allowed = process.env.MONGODB_QUEUE_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Explicit test URI and write opt-in required');

const { ObjectId } = mongoose.Types;
const A = new ObjectId();
const B = new ObjectId();
const OUTSIDER = new ObjectId();
const TRIP = new ObjectId();
const split = (user, shareAmount) => ({ _id: new ObjectId(), user, shareAmount });
const SEED = [
  { key: 'half', amount: 30.125, splits: [split(A, 30.125)] },
  { key: 'nearHalf', amount: 30.124999999999, splits: [split(A, 30.124999999999)] },
  { key: 'tail', amount: 30.25, splits: [split(A, 15.125), split(B, 15.125)] },
  { key: 'balanced', amount: 30, splits: [split(A, 15), split(B, 15)] },
  { key: 'thirds', amount: 100, splits: [split(A, 33.333333), split(B, 66.666667)] },
  { key: 'large', amount: 1000, splits: [split(A, 500.004), split(B, 400)] },
  { key: 'missingShare', amount: 12, splits: [split(A, 12), split(B, null)] },
  { key: 'outsider', amount: 20.005, splits: [split(A, 10), split(OUTSIDER, 10.005)] },
  {
    key: 'fx',
    amount: 30.004,
    originalAmount: 1,
    exchangeRate: 30.004,
    splits: [split(A, 30.004)],
  },
];

let db;
let owned = false;
let log;
const run = uri && allowed ? it : it.skip;

beforeAll(async () => {
  if (!uri || !allowed) return;
  await mongoose.connect(uri, {
    dbName: `tb_money_migration_${randomUUID().replaceAll('-', '')}`,
    serverSelectionTimeoutMS: 5000,
    autoIndex: false,
    autoCreate: false,
  });
  db = mongoose.connection.db;
  expect(await db.listCollections().toArray()).toHaveLength(0);
  await db.createCollection('verification_owner');
  owned = true;
});
afterAll(async () => {
  if (!db) return;
  try {
    if (owned) await db.dropDatabase();
  } finally {
    await mongoose.disconnect();
  }
});
beforeEach(async () => {
  if (!db) return;
  log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  for (const name of ['users', 'trips', 'expenses', 'payments', 'expense_money_migration_backups'])
    await db.collection(name).deleteMany({});
  await db.collection('users').insertMany([
    { _id: A, username: 'a', displayName: 'A' },
    { _id: B, username: 'b', displayName: 'B' },
  ]);
  await db.collection('trips').insertOne({
    _id: TRIP,
    name: 'Migration',
    hashCode: 'migrate',
    members: [
      { user: A, role: 'admin' },
      { user: B, role: 'member' },
    ],
  });
  await db.collection('expenses').insertMany(
    SEED.map(({ key, ...e }) => ({
      _id: new ObjectId(),
      key,
      trip: TRIP,
      payer: A,
      currency: 'TWD',
      category: 'food',
      date: new Date('2026-09-16'),
      ...e,
    }))
  );
});

const snapshot = () =>
  db
    .collection('expenses')
    .find({}, { projection: { _id: 0, key: 1, amount: 1, splits: 1 } })
    .sort({ key: 1 })
    .toArray();
const reports = (tag) =>
  log.mock.calls
    .filter(([msg]) => msg === `[normalize-expense-money] ${tag}`)
    .map(([, json]) => JSON.parse(json));
async function readAll() {
  const trip = await db.collection('trips').findOne({ _id: TRIP });
  const shells = [];
  for (const id of [A, B]) shells.push(await readTripShell(trip, id.toString(), '2026-09-16'));
  return { settlement: await readSettlement(TRIP.toString()), shells };
}

run('keeps every reader identical while making stored money reader-normalized', async () => {
  const before = await readAll();
  const original = await snapshot();
  await up(db);
  expect(await readAll()).toEqual(before);

  const rows = await snapshot();
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  expect(byKey.tail.splits.map((s) => s.shareAmount)).toEqual([15.13, 15.12]);
  expect(byKey.nearHalf.amount).toBe(30.12);
  expect(byKey.balanced).toEqual(original.find((r) => r.key === 'balanced'));
  expect(byKey.large.splits.map((s) => s.shareAmount)).toEqual([500, 400]);
  // 子文件其他欄位（_id、user）不被重寫。
  expect(byKey.tail.splits.map((s) => s._id)).toEqual(
    original.find((r) => r.key === 'tail').splits.map((s) => s._id)
  );
  for (const row of rows) {
    expect(roundMoney(row.amount)).toBe(row.amount);
    const shares = row.splits.map((s) => s.shareAmount);
    // 讀取端的重算對遷移後資料是恆等，之後才能從熱路徑移除。
    expect(normalizeShares(row.amount, shares), row.key).toEqual(shares);
  }

  const [report] = reports('up');
  expect(report).toMatchObject({ scanned: 9, updated: 8, skippedConcurrentEdit: 0 });
  expect(report.anomalies.map((a) => a.kinds)).toEqual([['unbalanced'], ['non-member-split']]);
});

run('is idempotent, keeps the first backup, and rolls back repeatably', async () => {
  const original = await snapshot();
  await up(db);
  const migrated = await snapshot();
  const backups = await db.collection('expense_money_migration_backups').find({}).toArray();
  await up(db);
  expect(await snapshot()).toEqual(migrated);
  expect(await db.collection('expense_money_migration_backups').find({}).toArray()).toEqual(
    backups
  );
  expect(reports('up')[1]).toMatchObject({ updated: 0 });

  await down(db);
  expect(await snapshot()).toEqual(
    original.map((r) =>
      r.key === 'missingShare'
        ? { ...r, splits: r.splits.map((s) => ({ ...s, shareAmount: s.shareAmount ?? null })) }
        : r
    )
  );
  expect(await db.collection('expense_money_migration_backups').countDocuments()).toBe(0);
  const restored = await snapshot();
  await down(db);
  expect(await snapshot()).toEqual(restored);
  await up(db);
  expect(await snapshot()).toEqual(migrated);
});

run('down keeps edits made after the migration', async () => {
  await up(db);
  await db
    .collection('expenses')
    .updateOne(
      { key: 'tail' },
      { $set: { amount: 40, 'splits.0.shareAmount': 20, 'splits.1.shareAmount': 20 } }
    );
  await db.collection('expenses').deleteOne({ key: 'half' });
  await down(db);
  const tail = await db.collection('expenses').findOne({ key: 'tail' });
  expect([tail.amount, ...tail.splits.map((s) => s.shareAmount)]).toEqual([40, 20, 20]);
  const thirds = await db.collection('expenses').findOne({ key: 'thirds' });
  expect(thirds.splits.map((s) => s.shareAmount)).toEqual([33.333333, 66.666667]);
  expect(reports('down')[0]).toEqual({ restored: 6, notRestoredEditedOrDeleted: 2 });
});

run('skips an expense edited between the scan and the write', async () => {
  const expenses = db.collection('expenses');
  const realUpdateOne = expenses.updateOne.bind(expenses);
  const collection = db.collection.bind(db);
  const racing = {
    collection: (name) =>
      name !== 'expenses'
        ? collection(name)
        : Object.assign(Object.create(expenses), {
            find: (...args) => expenses.find(...args),
            updateOne: async (filter, update) => {
              if (filter['splits.0.shareAmount'] === 15.125)
                await realUpdateOne({ key: 'tail' }, { $set: { amount: 50 } });
              return realUpdateOne(filter, update);
            },
          }),
  };
  await up(racing);
  const tail = await expenses.findOne({ key: 'tail' });
  expect([tail.amount, ...tail.splits.map((s) => s.shareAmount)]).toEqual([50, 15.125, 15.125]);
  expect(
    await db.collection('expense_money_migration_backups').findOne({ _id: tail._id })
  ).toBeNull();
  expect(reports('up')[0]).toMatchObject({ updated: 7, skippedConcurrentEdit: 1 });
});
