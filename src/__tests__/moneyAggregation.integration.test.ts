// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { roundMoney, roundMoneyExpr, normalizeShares, normalizedSplitsExpr } from '@/lib/money';
import { Expense, User, Trip } from '@/models';
import { readTripShell } from '@/lib/tripShellRead';
import { readSettlement } from '@/lib/settlementRead';
import { computeTripStats } from '@/lib/tripStats';
import { computeBudgetProgress } from '@/lib/budget';
import { toExpenseDto } from '@/lib/dto';
import { buildStatsExpensePagePipeline } from '@/lib/statsExpenseQuery';
import { applyPayments } from '@/lib/settlement';
import { getStats } from '@/actions/stats.actions';
const auth = vi.hoisted(() => ({ userId: '' }));
vi.mock('@/lib/auth', () => ({ getSession: async () => ({ userId: auth.userId }) }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => {} }));

// Only a fresh database on an explicitly supplied test server can be written/dropped.
const uri = process.env.MONGODB_QUEUE_TEST_URI;
const allowed = process.env.MONGODB_QUEUE_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Explicit test URI and write opt-in required');

// 半分邊界：MongoDB 的 $round 是銀行家捨入，30.125 會回 30.12，JS 的 roundMoney 回
// 30.13——同一筆舊資料因此在預算列／今日花費與結算／統計之間差一分。
const AMOUNTS = [
  30.124999999999, 30.125000000001, 30.125, 30.135, 1.005, 2.675, 0.005, 0.015, 999.995, -30.125,
  12, 30.124,
];

// 半分上下、正負數與不同數量級皆直接交給真實 MongoDB 比對。
for (let i = -100; i <= 100; i++) {
  for (const delta of [-1e-12, 0, 1e-12]) AMOUNTS.push(i + 0.125 + delta);
}

describe.skipIf(!uri || !allowed)('money rounding inside MongoDB aggregation', () => {
  let db: mongo.Db;
  let owned = false;
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      dbName: `tb_money_round_${randomUUID().replaceAll('-', '')}`,
      serverSelectionTimeoutMS: 5000,
      autoIndex: false,
      autoCreate: false,
    });
    db = mongoose.connection.db!;
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    await db
      .collection('amounts')
      .insertMany(AMOUNTS.map((amount, i) => ({ _id: i as unknown as mongo.ObjectId, amount })));
  });
  afterAll(async () => {
    try {
      if (owned) await db.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });

  it('rounds each amount exactly like roundMoney', async () => {
    const rows = await db
      .collection('amounts')
      .aggregate<{ amount: number; rounded: number }>([
        { $project: { _id: 0, amount: 1, rounded: roundMoneyExpr('$amount') } },
      ])
      .toArray();
    const actual = new Map(rows.map((row) => [row.amount, row.rounded]));
    for (const amount of AMOUNTS)
      expect([amount, actual.get(amount)]).toEqual([amount, roundMoney(amount)]);
  });

  it('normalizes fractional and balanced splits exactly like JavaScript', async () => {
    const cases = [
      { amount: 30.25, shares: [15.125, 15.125] },
      { amount: 1000, shares: [500, 499.99] },
      { amount: 10.01, shares: [5.005, 5.005] },
      { amount: 100, shares: [1, 1, 1] },
      { amount: 1, shares: [0, 0, 0] },
      { amount: 0.29, shares: [0.14, 0.15] },
      { amount: 10.005, shares: [9.984] },
      { amount: 300, shares: [5] },
      { amount: 300, shares: [] },
      { amount: 30.124999999999, shares: [30.124999999999] },
    ];
    for (let i = 1; i <= 200; i++)
      cases.push({ amount: i * 0.29, shares: [i * 0.031, i * 0.07, i * 0.189] });
    const collection = db.collection('split_cases');
    await collection.insertMany(
      cases.map((c) => ({
        amount: c.amount,
        splits: c.shares.map((shareAmount, user) => ({ user, shareAmount })),
      }))
    );
    const rows = await collection
      .aggregate<{
        amount: number;
        splits: { shareAmount: number }[];
      }>([{ $set: { splits: normalizedSplitsExpr() } }])
      .toArray();
    rows.forEach((row, i) => {
      expect(
        row.splits.map((s) => s.shareAmount),
        JSON.stringify(cases[i])
      ).toEqual(normalizeShares(row.amount, cases[i].shares));
    });
  });

  it.each([
    [30.125, [30.125]],
    [30.124999999999, [30.124999999999]],
    [30.25, [15.125, 15.125]],
    [30, [15, 15]],
    [10.01, [5.005, 5.005]],
    [1000, [500, 499.99]],
  ])('keeps actual readers and settlement consistent for %s', async (amount, shares) => {
    const tripId = new mongoose.Types.ObjectId();
    const ids = shares.map(() => new mongoose.Types.ObjectId());
    const users = ids.map((_id, i) => ({ _id, username: `audit${i}`, displayName: `Audit${i}` }));
    const trip = {
      _id: tripId,
      name: 'Audit',
      hashCode: 'audit',
      members: ids.map((user) => ({ user, role: 'admin' as const })),
    };
    const expense = {
      _id: new mongoose.Types.ObjectId(),
      trip: tripId,
      payer: ids[0],
      amount,
      originalAmount: amount,
      currency: 'TWD',
      exchangeRate: 1,
      category: 'food',
      description: 'audit',
      date: new Date('2026-09-16'),
      createdAt: new Date('2026-09-16'),
      splits: ids.map((user, i) => ({ user, shareAmount: shares[i] })),
    };
    await User.collection.insertMany(users);
    await Trip.collection.insertOne(trip);
    await Expense.collection.insertOne(expense);
    const settlement = await readSettlement(tripId.toString());
    const dto = toExpenseDto(
      {
        ...expense,
        payer: users[0],
        splits: users.map((user, i) => ({ user, shareAmount: shares[i] })),
      },
      tripId.toString()
    );
    const stats = computeTripStats(
      [
        {
          id: expense._id.toString(),
          category: 'food',
          date: '2026-09-16',
          description: '',
          amount,
          payerId: ids[0].toString(),
          payerName: 'Audit0',
          splits: ids.map((id, i) => ({ userId: id.toString(), shareAmount: shares[i] })),
        },
      ],
      users.map((u) => ({ userId: u._id.toString(), name: u.displayName })),
      {}
    );
    expect(roundMoney(settlement.balances.reduce((sum, b) => sum + b.totalOwed, 0))).toBe(
      settlement.totalExpenses
    );
    expect(stats.totalAmount).toBe(settlement.totalExpenses);
    for (const [i, id] of ids.entries()) {
      const shell = await readTripShell(trip, id.toString(), '2026-09-16');
      const owed = settlement.balances.find((b) => b.userId === id.toString())!.totalOwed;
      expect(shell.total_spent).toBe(owed);
      auth.userId = id.toString();
      const personal = await getStats();
      expect(personal.success).toBe(true);
      if (personal.success) expect(personal.data.totalAmount).toBe(owed);
      expect(shell.today_spent).toBe(settlement.totalExpenses);
      expect(dto.splits[i].share_amount).toBe(owed);
      expect(stats.memberSpends.find((m) => m.userId === id.toString())!.share).toBe(owed);
      expect(computeBudgetProgress(null, [dto], id.toString()).totalSpent).toBe(owed);
      for (const sort of ['amountAsc', 'dateDesc'] as const) {
        const [row] = await Expense.aggregate(
          buildStatsExpensePagePipeline({
            match: { trip: tripId },
            userId: id,
            sort,
            cursor: null,
            pageSize: 20,
          })
        );
        expect(row.splits.shareAmount).toBe(owed);
      }
    }
    const payments = settlement.transactions.map((t) => ({
      from: users.find((u) => u.displayName === t.from)!._id.toString(),
      to: users.find((u) => u.displayName === t.to)!._id.toString(),
      amount: t.amount,
    }));
    expect(applyPayments(settlement.balances, payments).map((b) => b.balance)).toEqual(
      ids.map(() => 0)
    );
  });

  it('treats a missing amount as zero rather than failing the pipeline', async () => {
    await db.collection('amounts').insertOne({ _id: -1 as unknown as mongo.ObjectId });
    const [row] = await db
      .collection('amounts')
      .aggregate<{ rounded: number }>([
        { $match: { _id: -1 } },
        { $project: { _id: 0, rounded: roundMoneyExpr('$amount') } },
      ])
      .toArray();
    expect(row.rounded).toBe(0);
  });
});
