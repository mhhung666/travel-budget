// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { roundMoney, roundMoneyExpr } from '@/lib/money';
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => {} }));

// Only a fresh database on an explicitly supplied test server can be written/dropped.
const uri = process.env.MONGODB_QUEUE_TEST_URI;
const allowed = process.env.MONGODB_QUEUE_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Explicit test URI and write opt-in required');

// 半分邊界：MongoDB 的 $round 是銀行家捨入，30.125 會回 30.12，JS 的 roundMoney 回
// 30.13——同一筆舊資料因此在預算列／今日花費與結算／統計之間差一分。
const AMOUNTS = [30.125, 30.135, 1.005, 2.675, 0.005, 0.015, 999.995, -30.125, 12, 30.124];

describe.skipIf(!uri || !allowed)('money rounding inside MongoDB aggregation', () => {
  let db: mongo.Db;
  let owned = false;
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      dbName: `tb_money_round_${randomUUID().replaceAll('-', '')}`,
      serverSelectionTimeoutMS: 5000,
      autoIndex: false,
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

  it('treats a missing amount as zero rather than failing the pipeline', async () => {
    await db.collection('amounts').insertOne({ _id: 99 as unknown as mongo.ObjectId });
    const [row] = await db
      .collection('amounts')
      .aggregate<{ rounded: number }>([
        { $match: { _id: 99 } },
        { $project: { _id: 0, rounded: roundMoneyExpr('$amount') } },
      ])
      .toArray();
    expect(row.rounded).toBe(0);
  });
});
