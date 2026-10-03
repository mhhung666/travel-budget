// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { settlementSchema } from '@travel-budget/contracts';

const auth = vi.hoisted(() => ({ userId: '' }));
vi.mock('@/lib/auth', () => ({ getSession: async () => ({ userId: auth.userId }) }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => {} }));
import { Expense, Payment, Trip, User } from '@/models';
import { getExpenses } from '@/actions/expense.actions';
import { mobileExpense, mobileExpenses } from '@/lib/mobile/expenses';
import { mobileSettlement } from '@/lib/mobile/settlement';
import { readSettlement } from '@/lib/settlementRead';
import { allocateMoney, roundMoney } from '@/lib/money';

// Only a fresh database on an explicitly supplied test server can be written/dropped.
const uri = process.env.MONGODB_QUEUE_TEST_URI;
const allowed = process.env.MONGODB_QUEUE_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Explicit test URI and write opt-in required');

const oid = () => new mongoose.Types.ObjectId();
const page = (tripId: string, cursor?: string | null) =>
  mobileExpenses(
    auth.userId,
    tripId,
    new URL(`https://example.test/expenses${cursor ? `?cursor=${cursor}` : ''}`)
  );
const idCompare = (a: mongoose.Types.ObjectId, b: mongoose.Types.ObjectId) =>
  a.toHexString() < b.toHexString() ? -1 : 1;
const evenShares = (cents: number, count: number) =>
  Array.from({ length: count }, (_, i) => Math.floor(cents / count) + (i < cents % count ? 1 : 0));

describe.skipIf(!uri || !allowed)('mobile read APIs on MongoDB', () => {
  let owned = false;
  const now = new Date('2026-10-03T00:00:00.000Z');
  const user = (name: string, isVirtual = false) => ({
    _id: oid(),
    username: `login-${name}`,
    displayName: `Name ${name}`,
    email: `${name}@example.invalid`,
    password: 'secret-hash',
    isVirtual,
    createdAt: now,
  });
  const [amy, bob, cara, dave] = ['amy', 'bob', 'cara', 'dave'].map((name) => user(name));
  const guest = user('guest', true);
  const outsider = user('outsider');
  const member = (u: { _id: mongoose.Types.ObjectId }, role = 'member') => ({ user: u._id, role });
  const trip = (name: string, members: ReturnType<typeof member>[]) => ({
    _id: oid(),
    name,
    hashCode: `code${name.replaceAll(' ', '').toLowerCase()}`,
    members,
    createdAt: now,
  });
  const ledger = trip('ledger', [member(amy, 'admin'), member(bob), member(guest), member(dave)]);
  const settled = trip('settled', [member(amy, 'admin'), member(bob)]);
  const empty = trip('empty', [member(amy, 'admin'), member(bob)]);
  const other = trip('other', [member(outsider, 'admin')]);

  type Row = {
    _id: mongoose.Types.ObjectId;
    trip: mongoose.Types.ObjectId;
    date: Date;
    createdAt: Date;
    [key: string]: unknown;
  };
  const expenses: Row[] = [];
  const row = (extra: Partial<Row> & Record<string, unknown>): Row => ({
    _id: oid(),
    trip: ledger._id,
    payer: amy._id,
    amount: 100,
    originalAmount: 100,
    currency: 'TWD',
    exchangeRate: 1,
    description: 'x',
    category: 'food',
    date: new Date('2026-09-10'),
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
    splits: [{ user: amy._id, shareAmount: 100 }],
    // Private data that must never be exposed.
    attachments: [{ key: 'receipts/private-key.jpg', contentType: 'image/jpeg', size: 1 }],
    tags: ['private-tag'],
    ...extra,
  });
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      dbName: `tb_mobile_read_${randomUUID().replaceAll('-', '')}`,
      serverSelectionTimeoutMS: 5000,
      autoIndex: false,
      autoCreate: false,
    });
    const db = mongoose.connection.db!;
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    await User.collection.insertMany([amy, bob, cara, dave, guest, outsider]);
    await Trip.collection.insertMany([ledger, settled, empty, other]);
    // 45 rows: groups of nine share a date and groups of three share createdAt (ties across pages).
    for (let i = 0; i < 45; i++) {
      const cents = (100 + i) * 100;
      const shares = evenShares(cents, 3);
      expenses.push(
        row({
          payer: (i % 2 === 0 ? amy : bob)._id,
          amount: cents / 100,
          originalAmount: cents / 100,
          description: `bulk ${i}`,
          date: new Date(Date.UTC(2026, 8, 10 + Math.floor(i / 9))),
          createdAt: new Date(Date.UTC(2026, 8, 1, 8, 0, Math.floor(i / 3))),
          splits: [amy, bob, guest].map((u, j) => ({ user: u._id, shareAmount: shares[j] / 100 })),
        })
      );
    }
    // Historical shape: the fields are absent (not null), and converted amounts are unrounded.
    const legacy = row({
      payer: amy._id,
      amount: 30.004,
      description: 'legacy',
      date: new Date('2026-08-20'),
      splits: [
        { user: amy._id, shareAmount: 15.002 },
        { user: bob._id, shareAmount: 15.002 },
      ],
    });
    for (const key of ['originalAmount', 'currency', 'exchangeRate', 'category'])
      delete legacy[key];
    expenses.push(
      row({
        payer: bob._id,
        amount: 99.9,
        originalAmount: 3000,
        currency: 'JPY',
        exchangeRate: 0.0333,
        category: 'shopping',
        description: 'foreign',
        date: new Date('2026-08-22'),
        splits: [
          { user: amy._id, shareAmount: 60 },
          { user: bob._id, shareAmount: 39.9 },
        ],
      }),
      // A virtual member pays and does not take part in the split.
      row({
        payer: guest._id,
        amount: 200,
        originalAmount: 200,
        category: 'transportation',
        description: 'virtual payer',
        date: new Date('2026-08-21'),
        splits: [
          { user: amy._id, shareAmount: 120 },
          { user: bob._id, shareAmount: 80 },
        ],
      }),
      legacy,
      // Payer reference that no longer resolves.
      row({
        payer: oid(),
        amount: 10,
        originalAmount: 10,
        description: 'orphan payer',
        date: new Date('2026-08-19'),
        splits: [{ user: oid(), shareAmount: 10 }],
      })
    );
    await Expense.collection.insertMany(expenses);
    await Payment.collection.insertOne({
      trip: ledger._id,
      from: bob._id,
      to: amy._id,
      amount: 20.5,
      note: 'cash',
      createdBy: bob._id,
      createdAt: now,
    });
    await Expense.collection.insertOne(
      row({
        trip: settled._id,
        amount: 100,
        originalAmount: 100,
        description: 'dinner',
        splits: [
          { user: amy._id, shareAmount: 50 },
          { user: bob._id, shareAmount: 50 },
        ],
      })
    );
    await Payment.collection.insertOne({
      trip: settled._id,
      from: bob._id,
      to: amy._id,
      amount: 50,
      note: '',
      createdBy: bob._id,
      createdAt: now,
    });
    auth.userId = amy._id.toString();
  });
  afterAll(async () => {
    try {
      if (owned) await mongoose.connection.db!.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });

  const expectedOrder = () =>
    [...expenses].sort(
      (a, b) =>
        b.date.getTime() - a.date.getTime() ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        idCompare(b._id, a._id)
    );

  it('pages in a stable order across ties and a concurrent insert', async () => {
    const order = expectedOrder();
    expect(order[19].date).toEqual(order[20].date);
    expect(order[19].createdAt).toEqual(order[20].createdAt);
    const tripId = ledger._id.toString();
    const first = await page(tripId);
    expect(first.items).toHaveLength(20);
    const second = await page(tripId, first.nextCursor);
    const interloper = row({
      date: new Date('2026-09-30'),
      description: 'inserted between pages',
    });
    await Expense.collection.insertOne(interloper);
    const third = await page(tripId, second.nextCursor);
    await Expense.collection.deleteOne({ _id: interloper._id });
    expect(third.nextCursor).toBeNull();
    const ids = [first, second, third].flatMap((p) => p.items.map((item) => item.id));
    expect(ids).toEqual(order.map((e) => e._id.toHexString()));
    expect(new Set(ids).size).toBe(order.length);
    expect(order).toHaveLength(49);
  });

  it('serves the cursor query from the trip index without a collection scan', async () => {
    await Expense.collection.createIndex({ trip: 1, date: -1, createdAt: -1 });
    const [boundary] = expectedOrder().slice(19, 20);
    const plan = await Expense.collection
      .find({
        trip: ledger._id,
        $or: [
          { date: { $lt: boundary.date } },
          { date: boundary.date, createdAt: { $lt: boundary.createdAt } },
          { date: boundary.date, createdAt: boundary.createdAt, _id: { $lt: boundary._id } },
        ],
      })
      .sort({ date: -1, createdAt: -1, _id: -1 })
      .limit(21)
      .explain('queryPlanner');
    expect(JSON.stringify(plan.queryPlanner.winningPlan)).not.toContain('COLLSCAN');
  });

  it('matches the Web expense reader for every expense', async () => {
    const web = await getExpenses(ledger._id.toString());
    if (!web.success) throw new Error('Web reader failed');
    const mobileRows = new Map<string, Awaited<ReturnType<typeof mobileExpense>>>();
    for (const expense of web.data)
      mobileRows.set(
        expense.id,
        await mobileExpense(auth.userId, ledger._id.toString(), expense.id)
      );
    expect(web.data).toHaveLength(expenses.length);
    for (const expense of web.data) {
      const detail = mobileRows.get(expense.id)!;
      expect(detail.amount).toBe(expense.amount);
      expect(detail.date).toBe(expense.date);
      expect(detail.description).toBe(expense.description);
      expect(detail.category).toBe(expense.category);
      expect(detail.payerId ?? '').toBe(expense.payer_id);
      expect(detail.currency).toBe(expense.currency ?? 'TWD');
      expect(detail.splits.map((s) => [s.userId ?? '', s.shareAmount])).toEqual(
        expense.splits.map((s) => [s.user_id, s.share_amount])
      );
      if (detail.payerId) expect(detail.payerName).toBe(expense.payer_name);
    }
    // Web reads the whole list at once; mobile pages must cover exactly the same rows.
    const ids = new Set<string>();
    let cursor: string | null = null;
    do {
      const next = await page(ledger._id.toString(), cursor);
      next.items.forEach((item) => ids.add(item.id));
      cursor = next.nextCursor;
    } while (cursor);
    expect(ids).toEqual(new Set(web.data.map((expense) => expense.id)));
  });

  it('keeps foreign, virtual-payer, legacy and unresolved-reference rows readable', async () => {
    const byDescription = async (description: string) => {
      const doc = expenses.find((e) => e.description === description)!;
      return mobileExpense(auth.userId, ledger._id.toString(), doc._id.toHexString());
    };
    expect(await byDescription('foreign')).toMatchObject({
      amount: 99.9,
      originalAmount: 3000,
      currency: 'JPY',
      exchangeRate: 0.0333,
      category: 'shopping',
    });
    expect(await byDescription('virtual payer')).toMatchObject({
      payerId: guest._id.toHexString(),
      payerName: 'Name guest',
      splits: [{ shareAmount: 120 }, { shareAmount: 80 }],
    });
    const legacy = await byDescription('legacy');
    expect(legacy).toMatchObject({
      amount: 30,
      originalAmount: 30,
      currency: 'TWD',
      exchangeRate: 1,
      category: 'other',
    });
    expect(legacy.splits.map((s) => s.shareAmount)).toEqual([15, 15]);
    expect(await byDescription('orphan payer')).toMatchObject({
      payerId: null,
      payerName: '',
      splits: [{ userId: null, displayName: '', shareAmount: 10 }],
    });
  });

  it('never exposes attachments, tags, login names, emails or share codes', async () => {
    const everything = [await page(ledger._id.toString())];
    const detail = await mobileExpense(
      auth.userId,
      ledger._id.toString(),
      expenses[0]._id.toHexString()
    );
    const settlement = await mobileSettlement(auth.userId, ledger._id.toString());
    expect(JSON.stringify([everything, detail, settlement])).not.toMatch(
      /private-key|private-tag|login-|example\.invalid|secret-hash|codeledger|hashCode/
    );
  });

  it('rejects non-members, other trips, share codes and malformed ids with 404', async () => {
    const mine = expenses[0]._id.toHexString();
    const rejected = [
      () =>
        mobileExpenses(outsider._id.toString(), ledger._id.toString(), new URL('https://x.test')),
      () => mobileExpense(outsider._id.toString(), ledger._id.toString(), mine),
      () => mobileSettlement(outsider._id.toString(), ledger._id.toString()),
      // The expense exists, but not in the trip addressed by the request.
      () => mobileExpense(auth.userId, settled._id.toString(), mine),
      () => mobileExpense(auth.userId, other._id.toString(), mine),
      () => mobileExpenses(auth.userId, ledger.hashCode, new URL('https://x.test')),
      () => mobileSettlement(auth.userId, ledger.hashCode),
      () => mobileExpense(auth.userId, ledger._id.toString(), 'not-an-id'),
      () => mobileExpense(auth.userId, ledger._id.toString(), oid().toHexString()),
    ];
    for (const run of rejected) await expect(run()).rejects.toMatchObject({ status: 404 });
  });

  it('loses access as soon as membership is removed', async () => {
    auth.userId = dave._id.toString();
    await expect(page(ledger._id.toString())).resolves.toBeTruthy();
    await Trip.updateOne({ _id: ledger._id }, { $pull: { members: { user: dave._id } } });
    await expect(page(ledger._id.toString())).rejects.toMatchObject({ status: 404 });
    await expect(mobileSettlement(auth.userId, ledger._id.toString())).rejects.toMatchObject({
      status: 404,
    });
    await Trip.updateOne({ _id: ledger._id }, { $push: { members: member(dave) } });
    auth.userId = amy._id.toString();
  });

  it('settlement matches the shared reader and distinguishes empty, settled and outstanding', async () => {
    const tripId = ledger._id.toString();
    const shared = await readSettlement(tripId);
    const mobile = settlementSchema.parse(await mobileSettlement(auth.userId, tripId));
    expect(mobile.totalExpenses).toBe(shared.totalExpenses);
    expect(mobile.balances.map((b) => [b.userId, b.balance])).toEqual(
      shared.balances.map((b) => [b.userId, b.balance])
    );
    expect(mobile.payments).toHaveLength(1);
    expect(mobile.status).toBe('outstanding');
    // Following every suggested transfer clears every balance.
    const remaining = new Map(mobile.balances.map((b) => [b.userId, Math.round(b.balance * 100)]));
    for (const t of mobile.suggestedTransfers) {
      remaining.set(t.fromId, remaining.get(t.fromId)! + Math.round(t.amount * 100));
      remaining.set(t.toId, remaining.get(t.toId)! - Math.round(t.amount * 100));
    }
    expect([...remaining.values()].every((cents) => Math.abs(cents) <= 1)).toBe(true);
    expect(mobile.suggestedTransfers.map((t) => t.fromName)).toEqual(
      shared.transactions.map((t) => t.from)
    );

    expect(await mobileSettlement(auth.userId, settled._id.toString())).toMatchObject({
      status: 'settled',
      totalExpenses: 100,
      suggestedTransfers: [],
    });
    expect(await mobileSettlement(auth.userId, empty._id.toString())).toMatchObject({
      status: 'empty',
      totalExpenses: 0,
      suggestedTransfers: [],
      payments: [],
    });
  });

  it('reads expenses written through the Expense model the way the Web action stores them', async () => {
    const modelTrip = trip('model', [member(amy, 'admin'), member(bob)]);
    await Trip.collection.insertOne(modelTrip);
    // Mirrors createExpense: converted amount rounded to cents, shares allocated to the cent,
    // receipt, tags and creator stored on the document.
    const amount = roundMoney(4500 * 0.0067);
    const shares = allocateMoney(amount, [1, 1, 1]);
    const [created] = await Expense.create([
      {
        trip: modelTrip._id,
        payer: bob._id,
        amount,
        originalAmount: 4500,
        currency: 'JPY',
        exchangeRate: 0.0067,
        description: 'written by the model',
        category: 'shopping',
        date: new Date('2026-10-05'),
        splits: [amy, bob, guest].map((u, i) => ({ user: u._id, shareAmount: shares[i] })),
        attachments: [
          {
            key: 'receipts/private-key.jpg',
            contentType: 'image/jpeg',
            size: 1,
            uploadedBy: bob._id,
          },
        ],
        createdBy: bob._id,
        tags: ['private-tag'],
      },
    ]);
    const tripId = modelTrip._id.toString();
    const detail = await mobileExpense(auth.userId, tripId, created._id.toString());
    expect(detail).toMatchObject({
      amount: 30.15,
      originalAmount: 4500,
      currency: 'JPY',
      exchangeRate: 0.0067,
      category: 'shopping',
      date: '2026-10-05',
      payerId: bob._id.toHexString(),
    });
    expect(roundMoney(detail.splits.reduce((sum, split) => sum + split.shareAmount, 0))).toBe(
      detail.amount
    );
    const list = await page(tripId);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ id: created._id.toString(), amount: 30.15 });
    // Same numbers as the Web reader for this trip.
    const web = await getExpenses(tripId);
    if (!web.success) throw new Error('Web reader failed');
    expect(web.data[0].amount).toBe(detail.amount);
    expect(web.data[0].splits.map((s) => s.share_amount)).toEqual(
      detail.splits.map((s) => s.shareAmount)
    );
    expect(JSON.stringify([list, detail])).not.toMatch(/private-key|private-tag|login-/);
  });

  it('cara, who is in no trip, sees nothing', async () => {
    await expect(
      mobileExpenses(cara._id.toString(), ledger._id.toString(), new URL('https://x.test'))
    ).rejects.toMatchObject({ status: 404 });
  });
});
