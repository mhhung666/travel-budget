// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLedgerTrip as getTrip,
  getLedgerTripShell as getTripShell,
} from '@/actions/trip.actions';
import {
  getLedgerExpenses as getExpenses,
  createLedgerExpense,
  updateLedgerExpense,
  deleteLedgerExpense,
} from '@/actions/expense.actions';
import { getLedgerMutation, writeWebTripSettings, writeWebPayment } from '@/actions/ledger.actions';
import { getLedgerSettlement as getSettlement } from '@/actions/settlement.actions';
import {
  getLedgerStats as getStats,
  getLedgerStatsExpensePage as getStatsExpensePage,
} from '@/actions/stats.actions';
import { getLedgerYearInReview as getYearInReview } from '@/actions/wrapped.actions';
import { GET as publicTrip } from '@/app/api/public/v2/trips/[id]/route';
import { GET as publicShell } from '@/app/api/public/v2/trips/[id]/shell/route';
import { GET as publicSettlement } from '@/app/api/public/v2/trips/[id]/settlement/route';
import { GET as legacyPublicStats } from '@/app/api/public/trips/[id]/stats/route';
import { GET as legacyPublicTrip } from '@/app/api/public/trips/[id]/route';
import { getTrip as legacyGetTrip, getTrips as legacyGetTrips } from '@/actions/trip.actions';
import { getExpenses as legacyGetExpenses } from '@/actions/expense.actions';
import { getSettlement as legacyGetSettlement } from '@/actions/settlement.actions';
import { NextRequest } from 'next/server';
import { computeLedgerSplits, type SplitMode } from '@/lib/expenseSplit';
const h = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession: h.session }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: vi.fn(),
}));
vi.mock('@/lib/expenseDeliveryRuntime', () => ({
  prepareExpenseBackgroundWrite: vi.fn(async () => false),
  runExpenseBackgroundDelivery: vi.fn(),
}));
vi.mock('@/lib/notify', () => ({
  notify: vi.fn(),
  deliverJoinNotification: vi.fn(),
  deliverPaymentNotification: vi.fn(),
}));
vi.mock('@/lib/storage', () => ({
  headObject: vi.fn(),
  deleteObjects: vi.fn(),
  presignGet: vi.fn(),
}));
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const optIn = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || optIn) && !(uri && optIn))
  throw new Error('Owned database URI and write opt-in are both required');
describe.skipIf(!uri || !optIn)('B2 Web with an owned replica-set database', () => {
  let db: mongo.Db,
    owned = false;
  const actor = new mongo.ObjectId(),
    peer = new mongo.ObjectId(),
    third = new mongo.ObjectId();
  const trip = new mongo.ObjectId(),
    expense = new mongo.ObjectId(),
    legacyTrip = new mongo.ObjectId();
  const ids = [actor, peer, third].map((id) => id.toString());
  const readExpenses = async () => {
    const r = await getExpenses(trip.toString());
    if (!r.success) throw new Error(r.error);
    return r.data;
  };
  const settings = async () => {
    const r = await getTrip(trip.toString());
    if (!r.success) throw new Error(r.error);
    return r.data;
  };
  beforeAll(async () => {
    vi.stubEnv('MONGODB_URI', uri!);
    vi.stubEnv('JWT_SECRET', 'isolated-b2-web-ledger-secret-at-least-32-characters');
    await mongoose.connect(uri!, {
      dbName: `tb_b2_${randomUUID().replaceAll('-', '')}`,
      autoIndex: false,
      autoCreate: false,
    });
    db = mongoose.connection.db!;
    expect((await db.admin().command({ hello: 1 })).setName).toBeTruthy();
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
  });
  afterAll(async () => {
    try {
      if (owned) await db.dropDatabase();
    } finally {
      await mongoose.disconnect();
      vi.unstubAllEnvs();
    }
  });
  beforeEach(async () => {
    for (const c of await db.listCollections().toArray())
      if (c.name !== 'verification_owner') await db.collection(c.name).deleteMany({});
    h.session.mockResolvedValue({ userId: ids[0] });
    await db.collection('users').insertMany(
      ids.map((id, i) => ({
        _id: new mongo.ObjectId(id),
        username: `user${i}`,
        displayName: `Person ${i}`,
        isVirtual: false,
      }))
    );
    const members = [actor, peer, third].map((user, i) => ({
      user,
      role: i === 0 ? 'admin' : 'member',
      joinedAt: new Date('2026-01-01'),
    }));
    await db.collection('trips').insertMany([
      {
        _id: trip,
        name: 'USD ledger',
        hashCode: 'b2usdxxx',
        baseCurrency: 'USD',
        members,
        createdAt: new Date('2026-01-01'),
      },
      {
        _id: legacyTrip,
        name: 'Legacy TWD',
        hashCode: 'b2twdxxx',
        members,
        createdAt: new Date('2026-01-01'),
      },
    ]);
    await db.collection('expenses').insertMany([
      {
        _id: expense,
        trip,
        baseCurrency: 'USD',
        payer: actor,
        createdBy: actor,
        amount: 20.1,
        originalAmount: 3000,
        currency: 'JPY',
        exchangeRate: 0.0067,
        description: 'USD dinner',
        category: 'food',
        date: new Date('2026-10-08'),
        createdAt: new Date('2026-10-08'),
        splits: [
          { user: actor, shareAmount: 8 },
          { user: peer, shareAmount: 12.1 },
        ],
        attachments: [
          {
            key: `receipts/${trip}/kept.jpg`,
            contentType: 'image/jpeg',
            size: 1,
            uploadedBy: actor,
            uploadedAt: new Date('2026-01-01'),
          },
        ],
        tags: ['keep'],
        itineraryDays: [],
      },
      {
        trip: legacyTrip,
        payer: actor,
        createdBy: actor,
        amount: 100,
        originalAmount: 100,
        currency: 'TWD',
        exchangeRate: 1,
        description: 'TWD dinner',
        category: 'food',
        date: new Date('2026-10-08'),
        createdAt: new Date('2026-10-08'),
        splits: [{ user: actor, shareAmount: 100 }],
        attachments: [],
        tags: [],
        itineraryDays: [],
      },
    ]);
  });
  it('reads USD public detail, shell and settlement without exposing private receipts or revisions', async () => {
    for (const route of [publicTrip, publicShell, publicSettlement]) {
      const res = await route(new NextRequest('http://local.test/api/public/trips/b2usdxxx'), {
        params: Promise.resolve({ id: 'b2usdxxx' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      const data = json.trip ?? json.shell ?? json;
      expect(data.ledger).toEqual({ baseCurrency: 'USD', moneyScale: 2 });
      expect(JSON.stringify(json)).not.toContain('kept.jpg');
      expect(data).not.toHaveProperty('budget_revision');
      expect(data).not.toHaveProperty('currency_revision');
    }
  });
  it('blocks old Web action identities and public URLs from reading USD as TWD', async () => {
    const res = await legacyPublicTrip(
      new NextRequest('http://local.test/api/public/trips/b2usdxxx'),
      { params: Promise.resolve({ id: 'b2usdxxx' }) }
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'CLIENT_UPGRADE_REQUIRED' });
    for (const action of [legacyGetTrip, legacyGetExpenses, legacyGetSettlement])
      expect(await action(trip.toString())).toMatchObject({
        success: false,
        code: 'CLIENT_UPGRADE_REQUIRED',
      });
    const twdStats = await legacyPublicStats(
      new NextRequest('http://local.test/api/public/trips/b2twdxxx/stats'),
      { params: Promise.resolve({ id: 'b2twdxxx' }) }
    );
    expect(twdStats.status).toBe(200);
    expect((await twdStats.json()).totalAmount).toBe(100);
    const trips = await legacyGetTrips();
    expect(trips.success).toBe(true);
    if (trips.success) expect(trips.data.map((t) => t.id)).toEqual([legacyTrip.toString()]);
    expect(await legacyGetTrip(legacyTrip.toString())).toMatchObject({
      success: true,
      data: { ledger: { baseCurrency: 'TWD' } },
    });
  });
  it('preserves foreign and non-equal accounting on metadata edits, and logs a UUID once', async () => {
    const before = await db.collection('expenses').findOne({ _id: expense });
    const e = (await readExpenses())[0];
    const body = {
      client_request_id: randomUUID(),
      base_currency: 'USD',
      expected_revision: e.revision!,
      description: 'Edited only',
    };
    expect((await updateLedgerExpense(trip.toString(), e.id, body)).success).toBe(true);
    expect((await updateLedgerExpense(trip.toString(), e.id, body)).success).toBe(true);
    const after = await db.collection('expenses').findOne({ _id: expense });
    for (const field of [
      'amount',
      'originalAmount',
      'currency',
      'exchangeRate',
      'splits',
      'attachments',
      'tags',
      'itineraryDays',
    ])
      expect(after![field]).toEqual(before![field]);
    expect(after!.description).toBe('Edited only');
    expect(await db.collection('activitylogs').countDocuments({ type: 'expense_updated' })).toBe(1);
    expect(await getLedgerMutation(body.client_request_id)).toMatchObject({
      success: true,
      data: { status: 'committed', operation: 'expense.update', ledger: { baseCurrency: 'USD' } },
    });
  });
  it('can preserve historical missing payer and split references during a metadata-only edit', async () => {
    await db.collection('expenses').updateOne({ _id: expense }, { $set: { payer: peer } });
    await db.collection('users').deleteOne({ _id: peer });
    const e = (await readExpenses())[0];
    expect(e.payer_id).toBe('');
    const result = await updateLedgerExpense(trip.toString(), e.id, {
      client_request_id: randomUUID(),
      base_currency: 'USD',
      expected_revision: e.revision!,
      description: 'Historical unchanged accounting',
    });
    expect(result.success).toBe(true);
    const saved = await db.collection('expenses').findOne({ _id: expense });
    expect(saved!.payer.toString()).toBe(peer.toString());
    expect(saved!.splits.map((s: { shareAmount: number }) => s.shareAmount)).toEqual([8, 12.1]);
    expect(saved!.description).toBe('Historical unchanged accounting');
  });
  it('persists a stale edit conflict without overwriting a newer foreign amount', async () => {
    const e = (await readExpenses())[0];
    const body = {
      client_request_id: randomUUID(),
      base_currency: 'USD',
      expected_revision: e.revision!,
      description: 'Stale edit',
    };
    await db.collection('expenses').updateOne(
      { _id: expense },
      {
        $set: {
          originalAmount: 4000,
          exchangeRate: 0.01,
          amount: 40,
          splits: [{ user: actor, shareAmount: 40 }],
        },
      }
    );
    expect(await updateLedgerExpense(trip.toString(), e.id, body)).toMatchObject({
      success: false,
      error: 'RESOURCE_CHANGED',
    });
    expect(await getLedgerMutation(body.client_request_id)).toMatchObject({
      success: true,
      data: { status: 'rejected', code: 'RESOURCE_CHANGED' },
    });
    expect((await db.collection('expenses').findOne({ _id: expense }))!.originalAmount).toBe(4000);
  });
  it.each(['equal', 'amount', 'percent', 'shares'] as SplitMode[])(
    'creates cent-balanced %s splits with the v2 UUID once',
    async (mode) => {
      const values =
        mode === 'amount'
          ? ['0.67', '0.67', '0.67']
          : mode === 'percent'
            ? ['50', '25', '25']
            : ['1', '2', '3'];
      const shares = computeLedgerSplits(
        mode,
        ids.map((id, i) => ({ id, selected: true, value: values[i] })),
        2.01,
        1
      );
      const body = {
        client_request_id: randomUUID(),
        base_currency: 'USD',
        payer_id: ids[0],
        original_amount: 2.01,
        currency: 'USD',
        exchange_rate: 1,
        description: mode,
        category: 'food',
        date: '2026-10-08',
        splits: ids.map((id) => ({ user_id: id, share_amount: shares.ledger[id] })),
      };
      const first = await createLedgerExpense(trip.toString(), body),
        again = await createLedgerExpense(trip.toString(), body);
      expect(first.success).toBe(true);
      expect(again).toEqual(first);
      expect(await db.collection('expenses').countDocuments({ trip, description: mode })).toBe(1);
      const row = await db.collection('expenses').findOne({ trip, description: mode });
      expect(row!.baseCurrency).toBe('USD');
      expect(row!.amount).toBe(2.01);
      expect(
        row!.splits.reduce(
          (sum: number, s: { shareAmount: number }) => sum + Math.round(s.shareAmount * 100),
          0
        )
      ).toBe(201);
    }
  );
  it('allows an ordinary member to set only their own budget and rejects a stale revision', async () => {
    h.session.mockResolvedValue({ userId: ids[1] });
    const shell = await getTripShell(trip.toString());
    expect(shell.success).toBe(true);
    if (!shell.success) throw new Error(shell.error);
    const body = {
      client_request_id: randomUUID(),
      base_currency: 'USD',
      expected_revision: shell.data.budget_revision!,
      total: 30.01,
      categories: [{ category: 'food', amount: 20.1 }],
    };
    expect((await writeWebTripSettings(trip.toString(), 'budget', body)).success).toBe(true);
    expect((await writeWebTripSettings(trip.toString(), 'budget', body)).success).toBe(true);
    const parent = await db.collection('trips').findOne({ _id: trip });
    expect(parent!.members[0].budget).toBeUndefined();
    expect(parent!.members[1].budget).toMatchObject({ total: 30.01, baseCurrency: 'USD' });
    expect(
      await writeWebTripSettings(trip.toString(), 'budget', {
        ...body,
        client_request_id: randomUUID(),
        total: 50,
      })
    ).toMatchObject({ success: false, error: 'RESOURCE_CHANGED' });
  });
  it('shares one UUID namespace between Web settings and payments', async () => {
    const dto = await settings();
    const uuid = randomUUID();
    expect(
      (
        await writeWebTripSettings(trip.toString(), 'currency', {
          client_request_id: uuid,
          expected_revision: dto.currency_revision!,
          base_currency: 'USD',
          default_currency: 'JPY',
          currencies: [
            { code: 'USD', rate: 99 },
            { code: 'JPY', rate: 0.0067 },
          ],
        })
      ).success
    ).toBe(true);
    const parent = await db.collection('trips').findOne({ _id: trip });
    expect(parent!.currencySettings.currencies[0].rate).toBeNull();
    const s = await getSettlement(trip.toString());
    if (!s.success) throw new Error(s.error);
    expect(
      (
        await writeWebPayment(trip.toString(), 'payment.create', {
          client_request_id: uuid,
          expected_revision: s.data.settlementRevision!,
          base_currency: 'USD',
          from_id: ids[1],
          to_id: ids[0],
          amount: 1,
          note: '',
        })
      ).success
    ).toBe(false);
    expect(await db.collection('payments').countDocuments({ trip })).toBe(0);
  });
  it('records and revokes a USD repayment once, with revisions from the displayed snapshot', async () => {
    const s = await getSettlement(trip.toString());
    if (!s.success) throw new Error(s.error);
    const body = {
      client_request_id: randomUUID(),
      base_currency: 'USD',
      expected_revision: s.data.settlementRevision!,
      from_id: ids[1],
      to_id: ids[0],
      amount: 1.01,
      note: '',
    };
    expect((await writeWebPayment(trip.toString(), 'payment.create', body)).success).toBe(true);
    expect((await writeWebPayment(trip.toString(), 'payment.create', body)).success).toBe(true);
    expect(await db.collection('payments').countDocuments({ trip })).toBe(1);
    const updated = await getSettlement(trip.toString());
    if (!updated.success) throw new Error(updated.error);
    expect(updated.data.payments[0].ledger?.baseCurrency).toBe('USD');
    const paymentId = updated.data.payments[0].id;
    const deletion = {
      client_request_id: randomUUID(),
      base_currency: 'USD',
      expected_revision: updated.data.paymentRevisions![paymentId],
    };
    expect(
      (await writeWebPayment(trip.toString(), 'payment.delete', deletion, paymentId)).success
    ).toBe(true);
    expect(
      (await writeWebPayment(trip.toString(), 'payment.delete', deletion, paymentId)).success
    ).toBe(true);
    expect(await db.collection('payments').countDocuments({ trip })).toBe(0);
  });
  it('deletes an expense and its comments once, retaining the terminal receipt', async () => {
    const e = (await readExpenses())[0];
    await db.collection('comments').insertOne({ expense, trip, body: 'comment' });
    const body = {
      client_request_id: randomUUID(),
      base_currency: 'USD',
      expected_revision: e.revision!,
    };
    expect((await deleteLedgerExpense(trip.toString(), e.id, body)).success).toBe(true);
    expect((await deleteLedgerExpense(trip.toString(), e.id, body)).success).toBe(true);
    expect(await db.collection('expenses').countDocuments({ _id: expense })).toBe(0);
    expect(await db.collection('comments').countDocuments({ expense })).toBe(0);
    expect(await db.collection('activitylogs').countDocuments({ type: 'expense_deleted' })).toBe(1);
    expect(await getLedgerMutation(body.client_request_id)).toMatchObject({
      success: true,
      data: { status: 'committed', operation: 'expense.delete' },
    });
  });
  it('filters personal stats, amount sorting and year summaries by ledger without mixed totals', async () => {
    const usd = await getStats({ baseCurrency: 'USD' }),
      twd = await getStats({ baseCurrency: 'TWD' });
    expect(usd).toMatchObject({
      success: true,
      data: { totalAmount: 8, ledger: { baseCurrency: 'USD' }, currencies: ['TWD', 'USD'] },
    });
    expect(twd).toMatchObject({
      success: true,
      data: { totalAmount: 100, ledger: { baseCurrency: 'TWD' } },
    });
    const page = await getStatsExpensePage({ baseCurrency: 'USD', sort: 'amountDesc' });
    expect(page.success).toBe(true);
    if (!page.success) throw new Error(page.error);
    expect(page.data.items).toHaveLength(1);
    expect(page.data.items[0]).toMatchObject({
      amount: 8,
      tripId: trip.toString(),
      ledger: { baseCurrency: 'USD' },
    });
    const year = await getYearInReview(2026);
    expect(year.success).toBe(true);
    if (!year.success) throw new Error(year.error);
    expect(year.data.monetaryGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ledger: { baseCurrency: 'USD', moneyScale: 2 },
          review: expect.objectContaining({ totalSpend: 8 }),
        }),
        expect.objectContaining({
          ledger: { baseCurrency: 'TWD', moneyScale: 2 },
          review: expect.objectContaining({ totalSpend: 100 }),
        }),
      ])
    );
  });
  it('does not read or replay receipts for a removed member', async () => {
    const s = await getSettlement(trip.toString());
    if (!s.success) throw new Error(s.error);
    const uuid = randomUUID();
    await writeWebPayment(trip.toString(), 'payment.create', {
      client_request_id: uuid,
      base_currency: 'USD',
      expected_revision: s.data.settlementRevision!,
      from_id: ids[1],
      to_id: ids[0],
      amount: 1,
      note: '',
    });
    await db.collection('trips').updateOne({ _id: trip }, {
      $pull: { members: { user: actor } },
    } as unknown as mongo.UpdateFilter<mongo.Document>);
    expect(await getLedgerMutation(uuid)).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });
});
