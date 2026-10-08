// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import { MAX_EXPENSE_AMOUNT, type MobileExpenseDetail } from '@travel-budget/contracts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { withLedgerV2 } from '@/lib/ledger';
import { Expense, Trip } from '@/models';
import { createExpense, deleteExpense, getExpenses } from '@/actions/expense.actions';
import { getMembers } from '@/actions/member.actions';
import { createExpenseForActor } from '@/lib/expenseCreate';
import { receiptSearch } from '@/lib/expenseCreateRequest';
import { createExpenseSchema } from '@/lib/validation';
import { mobileExpense, mobileExpenses } from '@/lib/mobile/expenses';
import { mobileExpenseOptions, mobileExpensePreview } from '@/lib/mobile/expenseOptions';
import { mobileCreateExpense, mobileExpenseRequest } from '@/lib/mobile/expenseWrite';
import { mobileSettlement } from '@/lib/mobile/settlement';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  background: vi.fn(),
  after: vi.fn(),
  head: vi.fn(),
}));
vi.mock('@/lib/storage', () => ({
  headObject: mocks.head,
  deleteObjects: vi.fn(),
  presignGet: vi.fn(),
}));
vi.mock('@/lib/expenseDeliveryRuntime', () => ({
  prepareExpenseBackgroundWrite: mocks.background,
  runExpenseBackgroundDelivery: vi.fn(),
}));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession: mocks.session }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));

// Needs a replica set: expense creation, its idempotency receipt and the trip fence run in one
// transaction. Reuses the opt-in contract of the other trip-writer integration suites.
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Requires isolated URI and write opt-in');
// The real notification code reads the validated environment (it only skips push without VAPID).
vi.stubEnv('MONGODB_URI', uri ?? 'mongodb://127.0.0.1:27017/unused');
vi.stubEnv('JWT_SECRET', 'integration_test_secret_at_least_32_chars');

const oid = () => new mongo.ObjectId();
const amy = oid();
const bob = oid();
const cara = oid(); // virtual member
const dan = oid(); // never joins the trip
const hex = (id: mongo.ObjectId) => id.toHexString();
// One UUID in four spellings: both mixed ones differ from each other and from lower/upper case.
const LOWER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const UPPER = LOWER.toUpperCase();
const MIXED = 'F47ac10B-58cc-4372-A567-0E02b2c3D479';
const MIXED_2 = 'f47AC10b-58CC-4372-a567-0e02B2C3d479';
const SPELLINGS = [LOWER, UPPER, MIXED, MIXED_2];
/** [spelling first used, spelling used afterwards] for every combination. */
const SPELLING_PAIRS = SPELLINGS.flatMap((first) => SPELLINGS.map((later) => [first, later]));
const jsonRequest = (body: unknown) =>
  new Request('https://example.com/api/v1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Creation receipts remain historical and lack read-time identity metadata. */
function receiptFields(detail: MobileExpenseDetail) {
  const { payerIsVirtual: _payerFlag, ...data } = detail;
  return { ...data, splits: data.splits.map(({ isVirtual: _flag, ...split }) => split) };
}

describe.skipIf(!uri || !allowed)('mobile expense write against an isolated replica set', () => {
  let owned = false;
  let tripId: string;
  const db = () => mongoose.connection.db!;
  const count = (collection: string) =>
    db()
      .collection(collection)
      .countDocuments({ trip: new mongo.ObjectId(tripId) });
  const body = (overrides: Record<string, unknown> = {}) => ({
    client_request_id: randomUUID(),
    payer_id: hex(amy),
    original_amount: 100,
    currency: 'TWD',
    exchange_rate: 1,
    description: 'Dinner',
    category: 'food',
    date: '2026-10-03',
    splits: [
      { user_id: hex(amy), share_amount: 33.34 },
      { user_id: hex(bob), share_amount: 33.33 },
      { user_id: hex(cara), share_amount: 33.33 },
    ],
    ...overrides,
  });
  // Retries may spell the key in any case, which `body()` (a generated UUID) does not allow.
  type Payload = Omit<ReturnType<typeof body>, 'client_request_id'> & { client_request_id: string };
  const create = (payload: unknown, user = amy, schedule = mocks.after) =>
    mobileCreateExpense(jsonRequest(payload), hex(user), tripId, schedule);
  const lookup = (key: string, user = amy) => mobileExpenseRequest(hex(user), tripId, key);
  // Notifications are per recipient and activity per trip; both are real writes in legacy mode.
  const effects = async () => ({
    notifications: await count('notifications'),
    activity: await count('activitylogs'),
  });

  beforeAll(async () => {
    await mongoose.connect(uri!, {
      dbName: `tb_mobile_write_${randomUUID().replaceAll('-', '')}`,
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 5000,
    });
    expect((await db().admin().command({ hello: 1 })).setName).toBeTruthy();
    expect(await db().listCollections().toArray()).toHaveLength(0);
    await db().createCollection('verification_owner');
    owned = true;
    // Production creates these through migrations; transactions then never create collections.
    for (const name of [
      'users',
      'trips',
      'expenses',
      'expensecreaterequests',
      'notifications',
      'activitylogs',
    ])
      await db().createCollection(name);
    await db()
      .collection('users')
      .insertMany([
        { _id: amy, username: 'amy-login', displayName: 'Amy', isVirtual: false },
        { _id: bob, username: 'bob-login', displayName: 'Bob', isVirtual: false },
        { _id: cara, username: 'cara-login', displayName: 'Cara', isVirtual: true },
        { _id: dan, username: 'dan-login', displayName: 'Dan', isVirtual: false },
      ]);
  });
  afterAll(async () => {
    try {
      if (owned) await db().dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.background.mockResolvedValue(false);
    mocks.session.mockResolvedValue({ userId: hex(amy) });
    const joined = (day: number) => new Date(`2026-09-0${day}T00:00:00.000Z`);
    tripId = (
      await Trip.create({
        name: 'Mobile writes',
        hashCode: randomUUID().replaceAll('-', '').slice(0, 8),
        members: [
          { user: amy, role: 'admin', joinedAt: joined(1) },
          { user: bob, role: 'member', joinedAt: joined(2) },
          { user: cara, role: 'member', joinedAt: joined(3) },
        ],
      })
    ).id;
  });
  afterEach(() => vi.restoreAllMocks());

  describe('v2 durable expense validation refusal', () => {
    it.each(['TWD', 'USD', 'JPY'])(
      'records a removed split member refusal for %s and replays it after rejoining',
      async (base) =>
        withLedgerV2(async () => {
          await db()
            .collection('trips')
            .updateOne({ _id: new mongo.ObjectId(tripId) }, { $set: { baseCurrency: base } });
          const preview = await mobileExpensePreview(
            jsonRequest({
              base_currency: base,
              amount: 100,
              currency: base,
              exchange_rate: 1,
              member_ids: [hex(amy), hex(bob), hex(cara)],
            }),
            hex(amy),
            tripId
          );
          const payload = body({
            base_currency: base,
            currency: base,
            splits: preview.splits.map((s) => ({ user_id: s.userId, share_amount: s.shareAmount })),
          });
          await Trip.updateOne({ _id: tripId }, { $pull: { members: { user: bob } } });
          await expect(create(payload)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
          expect(await lookup(payload.client_request_id)).toMatchObject({
            status: 'rejected',
            code: 'VALIDATION_ERROR',
            ledger: { baseCurrency: base, moneyScale: 2 },
          });
          expect(await count('expenses')).toBe(0);
          expect(await count('expensecreaterequests')).toBe(1);
          expect(await effects()).toEqual({ notifications: 0, activity: 0 });
          await Trip.updateOne(
            { _id: tripId },
            { $push: { members: { user: bob, role: 'member' } } }
          );
          await expect(create(payload)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
          await expect(create({ ...payload, description: 'Changed body' })).rejects.toMatchObject({
            code: 'IDEMPOTENCY_CONFLICT',
          });
          // Only explicit new confirmation starts a new UUID. The old UUID stays terminal forever.
          expect(await create({ ...payload, client_request_id: randomUUID() })).toMatchObject({
            amount: 100,
          });
          expect(await count('expenses')).toBe(1);
          expect(await count('expensecreaterequests')).toBe(2);
          expect(await lookup(payload.client_request_id)).toMatchObject({
            status: 'rejected',
            code: 'VALIDATION_ERROR',
          });
        })
    );
    it('serializes simultaneous validation refusals into one terminal receipt', async () =>
      withLedgerV2(async () => {
        const payload = body({ base_currency: 'TWD' });
        await Trip.updateOne({ _id: tripId }, { $pull: { members: { user: bob } } });
        const outcomes = await Promise.allSettled([create(payload), create(payload)]);
        expect(
          outcomes.every(
            (result) => result.status === 'rejected' && result.reason.code === 'VALIDATION_ERROR'
          )
        ).toBe(true);
        expect(await count('expensecreaterequests')).toBe(1);
        expect(await count('expenses')).toBe(0);
      }));
    it('does not publish any terminal receipt for an actor removed before submission', async () =>
      withLedgerV2(async () => {
        const payload = body({ base_currency: 'TWD' });
        await Trip.updateOne({ _id: tripId }, { $pull: { members: { user: amy } } });
        await expect(create(payload)).rejects.toMatchObject({ status: 404 });
        expect(await count('expensecreaterequests')).toBe(0);
        expect(await count('expenses')).toBe(0);
      }));
    it('preserves a committed result after split members leave', async () =>
      withLedgerV2(async () => {
        const payload = body({ base_currency: 'TWD' });
        const accepted = await create(payload);
        await Trip.updateOne({ _id: tripId }, { $pull: { members: { user: bob } } });
        expect(await create(payload)).toEqual(accepted);
        expect(await lookup(payload.client_request_id)).toMatchObject({
          status: 'committed',
          expense: accepted,
        });
        expect(await count('expenses')).toBe(1);
        expect(await count('expensecreaterequests')).toBe(1);
      }));
    it.each(['shares', 'rate', 'attachment'])(
      'records known pre-write %s validation under the same UUID',
      async (invalid) =>
        withLedgerV2(async () => {
          const payload = body({
            base_currency: 'TWD',
            ...(invalid === 'shares' ? { splits: [{ user_id: hex(amy), share_amount: 99 }] } : {}),
            ...(invalid === 'rate' ? { currency: 'USD', exchange_rate: 1e12 } : {}),
            ...(invalid === 'attachment'
              ? {
                  attachments: [
                    { key: `receipts/${tripId}/missing.jpg`, content_type: 'image/jpeg', size: 10 },
                  ],
                }
              : {}),
          });
          if (invalid === 'attachment') {
            mocks.head.mockResolvedValue(null);
            await expect(
              createExpenseForActor(
                { tripId, actorId: hex(amy), input: createExpenseSchema.parse(payload) },
                mocks.after
              )
            ).rejects.toThrow('VALIDATION_ERROR');
          } else await expect(create(payload)).rejects.toThrow('VALIDATION_ERROR');
          expect(await lookup(payload.client_request_id)).toMatchObject({
            status: 'rejected',
            code: 'VALIDATION_ERROR',
          });
          expect(await count('expenses')).toBe(0);
          expect(await count('expensecreaterequests')).toBe(1);
        })
    );
    it('rolls back instead of publishing a refusal when receipt persistence fails', async () =>
      withLedgerV2(async () => {
        const payload = body({ base_currency: 'TWD' });
        await Trip.updateOne({ _id: tripId }, { $pull: { members: { user: bob } } });
        const original = mongo.Collection.prototype.insertOne;
        const spy = vi.spyOn(mongo.Collection.prototype, 'insertOne').mockImplementation(function (
          this: mongo.Collection,
          ...args
        ) {
          if (this.collectionName === 'expensecreaterequests')
            throw new Error('receipt unavailable');
          return original.apply(this, args);
        });
        await expect(create(payload)).rejects.toThrow('receipt unavailable');
        spy.mockRestore();
        expect(await lookup(payload.client_request_id)).toEqual({ status: 'not_found' });
        expect(await count('expenses')).toBe(0);
        expect(await count('expensecreaterequests')).toBe(0);
      }));
  });

  describe('G2b currency preview to durable receipt', () => {
    it.each([
      [100, 0.2156789012345, 'JPY', 21.57],
      [0.01, 1e-7, 'KRW', 0],
      [50_000_000_000, 0.02, 'JPY', 1_000_000_000],
      [0.01, 1e11, 'USD', 1_000_000_000],
    ])(
      'stores original %s at rate %s %s exactly and replays after settings change',
      async (original, rate, currency, total) => {
        const p = await mobileExpensePreview(
          jsonRequest({
            amount: original,
            currency,
            exchange_rate: rate,
            member_ids: [hex(cara), hex(bob), hex(amy)],
          }),
          hex(amy),
          tripId
        );
        expect(p).toMatchObject({
          amount: total,
          originalAmount: original,
          currency,
          exchangeRate: rate,
        });
        const payload = body({
          original_amount: original,
          currency,
          exchange_rate: rate,
          splits: p.splits.map((s) => ({ user_id: s.userId, share_amount: s.shareAmount })),
        });
        const outcomes = await Promise.all(Array.from({ length: 4 }, () => create(payload)));
        expect(
          outcomes.every((value) => JSON.stringify(value) === JSON.stringify(outcomes[0]))
        ).toBe(true);
        expect(outcomes[0]).toMatchObject({
          amount: total,
          originalAmount: original,
          exchangeRate: rate,
          currency,
          splits: p.splits,
        });
        const raw = await db()
          .collection('expenses')
          .findOne({ _id: new mongo.ObjectId(outcomes[0].id) });
        expect(raw).toMatchObject({
          amount: total,
          originalAmount: original,
          exchangeRate: rate,
          currency,
        });
        expect(
          raw!.splits.reduce(
            (sum: number, split: { shareAmount: number }) =>
              sum + Math.round(split.shareAmount * 100),
            0
          )
        ).toBe(Math.round(total * 100));
        await Trip.updateOne(
          { _id: tripId },
          {
            $set: {
              currencySettings: { defaultCurrency: 'USD', currencies: [{ code: 'JPY', rate: 9 }] },
            },
          }
        );
        expect(await lookup(payload.client_request_id)).toEqual({
          status: 'committed',
          expense: outcomes[0],
        });
        expect(await create(payload)).toEqual(outcomes[0]);
        expect(await count('expenses')).toBe(1);
        expect(await count('expensecreaterequests')).toBe(1);
        await expect(create({ ...payload, exchange_rate: rate * 2 })).rejects.toMatchObject({
          status: 409,
        });
      }
    );
    it('rejects overflowing conversion and rolls back receipt/expense as a single foreign write', async () => {
      const invalid = body({ currency: 'JPY', original_amount: 100, exchange_rate: 1e308 });
      await expect(create(invalid)).rejects.toMatchObject({ status: 400 });
      expect(await count('expenses')).toBe(0);
      const p = await mobileExpensePreview(
        jsonRequest({ amount: 100, currency: 'JPY', exchange_rate: 0.215, member_ids: [hex(amy)] }),
        hex(amy),
        tripId
      );
      const payload = body({
        currency: 'JPY',
        exchange_rate: 0.215,
        splits: p.splits.map((s) => ({ user_id: s.userId, share_amount: s.shareAmount })),
      });
      const originalInsert = mongo.Collection.prototype.insertOne;
      const spy = vi
        .spyOn(mongo.Collection.prototype, 'insertOne')
        .mockImplementation(async function (this: mongo.Collection, ...args) {
          if (this.collectionName === 'expensecreaterequests')
            throw new Error('foreign receipt failure');
          return originalInsert.apply(this, args);
        });
      try {
        await expect(create(payload)).rejects.toThrow('foreign receipt failure');
      } finally {
        spy.mockRestore();
      }
      expect(await count('expenses')).toBe(0);
      expect(await count('expensecreaterequests')).toBe(0);
    });
  });

  it('previews, creates and reads back a fixed-order equal split that all readers agree on', async () => {
    const options = await mobileExpenseOptions(hex(amy), tripId);
    expect(options.members.map((member) => member.displayName)).toEqual(['Amy', 'Bob', 'Cara']);
    expect(options.members.map((m) => m.isVirtual)).toEqual([false, false, true]);
    expect(JSON.stringify(options)).not.toMatch(/login|email/);

    const preview = await mobileExpensePreview(
      jsonRequest({ amount: 100, member_ids: [...options.members].reverse().map((m) => m.id) }),
      hex(amy),
      tripId
    );
    expect(preview.splits.map((split) => split.shareAmount)).toEqual([33.34, 33.33, 33.33]);
    expect(await count('expenses')).toBe(0);

    const created = await create(
      body({
        splits: preview.splits.map((split) => ({
          user_id: split.userId,
          share_amount: split.shareAmount,
        })),
      })
    );
    expect(created).toMatchObject({
      date: '2026-10-03',
      description: 'Dinner',
      category: 'food',
      payerId: hex(amy),
      payerName: 'Amy',
      amount: 100,
      originalAmount: 100,
      currency: 'TWD',
      exchangeRate: 1,
    });
    expect(created.splits.map((split) => split.shareAmount)).toEqual([33.34, 33.33, 33.33]);

    const stored = await Expense.findById(created.id).lean();
    expect(stored).toMatchObject({
      amount: 100,
      originalAmount: 100,
      currency: 'TWD',
      exchangeRate: 1,
      description: 'Dinner',
      category: 'food',
      date: new Date('2026-10-03T00:00:00.000Z'),
    });
    expect(String(stored?.createdBy)).toBe(hex(amy));
    expect(stored?.splits.map((split) => split.shareAmount)).toEqual([33.34, 33.33, 33.33]);

    // The same expense through every reader: mobile list/detail, Web list and the settlement.
    const list = await mobileExpenses(
      hex(bob),
      tripId,
      new URL(`https://example.com/api/v1/trips/${tripId}/expenses`)
    );
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ id: created.id, amount: 100, payerName: 'Amy' });
    const read = await mobileExpense(hex(bob), tripId, created.id);
    expect(read.payerIsVirtual).toBe(false);
    expect(read.splits.map((s) => s.isVirtual)).toEqual([false, false, true]);
    expect(receiptFields(read)).toEqual(created);
    const web = await getExpenses(tripId);
    expect(web.success && web.data).toHaveLength(1);
    if (web.success) {
      expect(web.data[0].amount).toBe(100);
      expect(web.data[0].splits.map((split) => split.share_amount)).toEqual([33.34, 33.33, 33.33]);
    }
    const settlement = await mobileSettlement(hex(amy), tripId);
    expect(settlement.totalExpenses).toBe(100);
    expect(Object.fromEntries(settlement.balances.map((b) => [b.displayName, b.balance]))).toEqual({
      Amy: 66.66,
      Bob: -33.33,
      Cara: -33.33,
    });
  });

  it('lets the payer stay out of the split and keeps 0.01 split three ways at 0.01', async () => {
    const outside = await create(
      body({
        splits: [
          { user_id: hex(bob), share_amount: 50 },
          { user_id: hex(cara), share_amount: 50 },
        ],
      })
    );
    expect(outside.payerId).toBe(hex(amy));
    expect(outside.splits.map((split) => split.userId)).toEqual([hex(bob), hex(cara)]);
    const tiny = await create(
      body({
        original_amount: 0.01,
        splits: [
          { user_id: hex(amy), share_amount: 0.01 },
          { user_id: hex(bob), share_amount: 0 },
          { user_id: hex(cara), share_amount: 0 },
        ],
      })
    );
    expect(tiny.splits.reduce((sum, split) => sum + split.shareAmount, 0)).toBe(0.01);
    const settlement = await mobileSettlement(hex(amy), tripId);
    expect(settlement.totalExpenses).toBe(100.01);
  });

  it('keeps the member order of the Web member list', async () => {
    const web = await getMembers(tripId);
    expect(web.success && web.data.map((member) => member.id)).toEqual(
      (await mobileExpenseOptions(hex(amy), tripId)).members.map((member) => member.id)
    );
  });

  describe('idempotency', () => {
    it('collapses eight concurrent identical requests into one expense with one set of effects', async () => {
      const payload = body();
      const results = await Promise.all(Array.from({ length: 8 }, () => create(payload)));
      for (const result of results) expect(result).toEqual(results[0]);
      expect(await count('expenses')).toBe(1);
      expect(await count('expensecreaterequests')).toBe(1);
      // Bob is the only human recipient; Amy acted and Cara is virtual.
      expect(await effects()).toEqual({ notifications: 1, activity: 1 });
      expect(mocks.after).not.toHaveBeenCalled();
    });

    it('collapses concurrent retries in different letter cases from both adapters into one expense', async () => {
      const key = randomUUID();
      const payload = body({ client_request_id: key });
      const spelled = (index: number) => ({
        ...payload,
        client_request_id: index % 2 ? key.toUpperCase() : key,
      });
      const outcomes = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          index % 3 ? create(spelled(index)) : createExpense(tripId, spelled(index))
        )
      );
      const ids = outcomes.map((outcome) =>
        'success' in outcome ? (outcome.success ? outcome.data.id : 'failed') : outcome.id
      );
      expect(new Set(ids).size).toBe(1);
      expect(await count('expenses')).toBe(1);
      expect(await count('expensecreaterequests')).toBe(1);
      expect(await effects()).toEqual({ notifications: 1, activity: 1 });
    });

    it('reports exactly one creation among concurrent service calls', async () => {
      const input = createExpenseSchema.parse(body());
      const outcomes = await Promise.all(
        Array.from({ length: 8 }, () =>
          createExpenseForActor({ tripId, actorId: hex(amy), input }, mocks.after)
        )
      );
      expect(outcomes.filter((outcome) => !outcome.replayed)).toHaveLength(1);
      expect(new Set(outcomes.map((outcome) => outcome.data.id)).size).toBe(1);
    });

    it('replays without writing again or repeating a side effect, also when delivered by outbox', async () => {
      for (const outbox of [false, true]) {
        mocks.background.mockResolvedValue(outbox);
        mocks.after.mockClear();
        const before = { expenses: await count('expenses'), ...(await effects()) };
        const payload = body();
        const first = await create(payload);
        for (let attempt = 0; attempt < 3; attempt += 1)
          expect(await create(payload)).toEqual(first);
        expect(await count('expenses')).toBe(before.expenses + 1);
        expect(mocks.after).toHaveBeenCalledTimes(outbox ? 1 : 0);
        const now = await effects();
        // Legacy delivery writes one notification and one activity entry; the outbox writes neither.
        expect(now.notifications - before.notifications).toBe(outbox ? 0 : 1);
        expect(now.activity - before.activity).toBe(outbox ? 0 : 1);
        if (outbox) {
          const stored = await Expense.findById(first.id)
            .select('+expenseDelivery +expenseDeliveryEvent')
            .lean();
          expect(stored?.expenseDelivery).toMatchObject({ status: 'pending' });
          expect(stored?.expenseDeliveryEvent).toMatchObject({ expenseId: first.id });
        }
      }
    });

    it('answers 409 for another payload under the same key and treats key case as the same key', async () => {
      const payload = body();
      const first = await create(payload);
      await expect(create({ ...payload, description: 'Changed' })).rejects.toMatchObject({
        status: 409,
        code: 'IDEMPOTENCY_CONFLICT',
      });
      await expect(
        create({ ...payload, original_amount: 100.01, splits: payload.splits })
      ).rejects.toMatchObject({ status: 409 });
      expect(
        await create({ ...payload, client_request_id: payload.client_request_id.toUpperCase() })
      ).toEqual(first);
      expect(await count('expenses')).toBe(1);
      expect((await Expense.findById(first.id).lean())?.description).toBe('Dinner');
    });

    it('scopes a key to the member that used it', async () => {
      const payload = body({ payer_id: hex(bob) });
      const mine = await create(payload, amy);
      const theirs = await create(payload, bob);
      expect(theirs.id).not.toBe(mine.id);
      expect(await count('expenses')).toBe(2);
      expect(await lookup(payload.client_request_id, amy)).toMatchObject({
        status: 'committed',
        expense: { id: mine.id },
      });
      expect(await lookup(payload.client_request_id, bob)).toMatchObject({
        status: 'committed',
        expense: { id: theirs.id },
      });
    });

    it('commits many different requests concurrently', async () => {
      const payloads = Array.from({ length: 8 }, (_, index) =>
        body({ description: `Concurrent ${index}` })
      );
      const results = await Promise.all(payloads.map((payload) => create(payload)));
      expect(new Set(results.map((result) => result.id)).size).toBe(8);
      expect(await count('expenses')).toBe(8);
      expect(await count('expensecreaterequests')).toBe(8);
      expect((await mobileSettlement(hex(amy), tripId)).totalExpenses).toBe(800);
    });

    it('reports what happened to a key, only to the member who used it', async () => {
      const payload = body();
      expect(await lookup(payload.client_request_id)).toEqual({ status: 'not_found' });
      const created = await create(payload);
      expect(await lookup(payload.client_request_id)).toEqual({
        status: 'committed',
        expense: created,
      });
      expect(await lookup(payload.client_request_id, bob)).toEqual({ status: 'not_found' });
      await expect(lookup(payload.client_request_id, dan)).rejects.toMatchObject({ status: 404 });
      await expect(lookup('not-a-uuid')).rejects.toMatchObject({ status: 400 });
    });

    it('does not bring a deleted expense back and still reports it as committed', async () => {
      const payload = body();
      const created = await create(payload);
      expect(await deleteExpense(tripId, created.id)).toMatchObject({ success: true });
      expect(await count('expenses')).toBe(0);
      expect(await create(payload)).toEqual(created);
      expect(await count('expenses')).toBe(0);
      expect(await lookup(payload.client_request_id)).toEqual({
        status: 'committed',
        expense: created,
      });
    });

    it('gives a removed member nothing, neither a replay nor a lookup nor a new expense', async () => {
      const payload = body({ payer_id: hex(bob) });
      await create(payload, bob);
      await Trip.updateOne({ _id: tripId }, { $pull: { members: { user: bob } } });
      await expect(create(payload, bob)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      await expect(lookup(payload.client_request_id, bob)).rejects.toMatchObject({ status: 404 });
      await expect(create(body(), bob)).rejects.toMatchObject({ status: 404 });
      expect(await count('expenses')).toBe(1);
    });

    it('refuses writes once a trip is being deleted', async () => {
      await Trip.updateOne({ _id: tripId }, { $set: { expenseDeliveryDeleting: true } });
      await expect(create(body())).rejects.toMatchObject({ status: 404 });
      expect(await count('expenses')).toBe(0);
      expect(await count('expensecreaterequests')).toBe(0);
    });
  });

  describe('atomicity', () => {
    it('leaves neither expense nor receipt nor side effect when the receipt cannot be stored', async () => {
      const original = mongo.Collection.prototype.insertOne;
      const insert = vi
        .spyOn(mongo.Collection.prototype, 'insertOne')
        .mockImplementation(async function (this: mongo.Collection, ...args) {
          if (this.collectionName === 'expensecreaterequests')
            throw new Error('injected receipt failure');
          return original.apply(this, args);
        });
      const payload = body();
      // Unexpected failures surface untouched: the adapter answers 5xx, outcome unknown to the client.
      await expect(create(payload)).rejects.toThrow('injected receipt failure');
      insert.mockRestore();
      expect(await count('expenses')).toBe(0);
      expect(await count('expensecreaterequests')).toBe(0);
      expect(await effects()).toEqual({ notifications: 0, activity: 0 });
      expect(await lookup(payload.client_request_id)).toEqual({ status: 'not_found' });
      // Retrying under the same key then succeeds exactly once.
      const created = await create(payload);
      expect(await create(payload)).toEqual(created);
      expect(await count('expenses')).toBe(1);
      expect(await count('expensecreaterequests')).toBe(1);
    });

    it('leaves nothing behind when the expense itself fails to insert', async () => {
      vi.spyOn(Expense, 'create').mockRejectedValueOnce(new Error('injected insert failure'));
      const payload = body();
      await expect(create(payload)).rejects.toThrow('injected insert failure');
      expect(await count('expenses')).toBe(0);
      expect(await count('expensecreaterequests')).toBe(0);
      expect(await create(payload)).toMatchObject({ amount: 100 });
    });

    it.each([
      ['a payer outside the trip', { payer_id: hex(dan) }],
      [
        'a split member outside the trip',
        {
          splits: [
            { user_id: hex(amy), share_amount: 50 },
            { user_id: hex(dan), share_amount: 50 },
          ],
        },
      ],
      ['shares that do not add up', { splits: [{ user_id: hex(amy), share_amount: 99 }] }],
      ['a share beyond the amount', { splits: [{ user_id: hex(amy), share_amount: 100.02 }] }],
    ])(
      'rejects %s and stores nothing, so the corrected request can reuse the key',
      async (_label, overrides) => {
        const payload = body(overrides);
        await expect(create(payload)).rejects.toMatchObject({
          status: 400,
          code: 'VALIDATION_ERROR',
        });
        expect(await count('expenses')).toBe(0);
        expect(await count('expensecreaterequests')).toBe(0);
        expect(
          await create({ ...payload, ...body(), client_request_id: payload.client_request_id })
        ).toMatchObject({ amount: 100 });
        expect(await count('expenses')).toBe(1);
      }
    );

    it('normalizes shares that are one cent short to the exact total', async () => {
      const created = await create(
        body({
          splits: [
            { user_id: hex(amy), share_amount: 33.33 },
            { user_id: hex(bob), share_amount: 33.33 },
            { user_id: hex(cara), share_amount: 33.33 },
          ],
        })
      );
      expect(
        created.splits.reduce((sum, split) => sum + Math.round(split.shareAmount * 100), 0)
      ).toBe(10000);
    });

    it.each([
      ['an impossible date', { date: '2026-02-31' }],
      ['a duplicated member', { splits: [body().splits[0], body().splits[0]] }],
      ['an amount beyond the safe integers', { original_amount: 1e15 }],
      ['an amount just above the limit', { original_amount: 1_000_000_000.01 }],
      ['the amount that used to drift by a cent', { original_amount: 10_000_000_000_000 }],
      ['a fractional cent', { original_amount: 10.005 }],
      ['unsupported currency', { currency: 'ZZZ' }],
      ['an attachment list', { attachments: [] }],
    ])('rejects %s at the boundary and writes nothing', async (_label, overrides) => {
      await expect(create(body(overrides))).rejects.toMatchObject({ status: 400 });
      expect(await count('expenses')).toBe(0);
      expect(await count('expensecreaterequests')).toBe(0);
    });
  });

  describe('receipts stored before keys matched in any letter case', () => {
    type ReceiptDoc = { _id: string; trip: mongo.ObjectId; fingerprint: string; data: unknown };
    const receipts = () => db().collection<ReceiptDoc>('expensecreaterequests');
    // A receipt exactly as every earlier version stored it: the key as it was sent in the `_id`, a
    // SHA-256 of the schema-parsed input as the fingerprint. Built here, without any production
    // code, so that a change of the format cannot slip through unnoticed.
    const earlierReceipt = (user: mongo.ObjectId, payload: Payload, data: unknown) => ({
      _id: `${tripId}:${hex(user)}:${payload.client_request_id}`,
      trip: new mongo.ObjectId(tripId),
      fingerprint: createHash('sha256')
        .update(JSON.stringify(createExpenseSchema.parse(payload)))
        .digest('hex'),
      data,
    });
    /** The state after an earlier server accepted `payload` for `user`: its expense and its receipt. */
    async function acceptedEarlier(payload: Payload, user = amy) {
      mocks.session.mockResolvedValue({ userId: hex(user) });
      const accepted = await createExpense(tripId, { ...payload, client_request_id: randomUUID() });
      mocks.session.mockResolvedValue({ userId: hex(amy) });
      if (!accepted.success) throw new Error('could not set up the earlier expense');
      await receipts().deleteMany({ trip: new mongo.ObjectId(tripId) });
      await receipts().insertOne(earlierReceipt(user, payload, accepted.data));
      return accepted.data;
    }
    const web = (payload: Payload) => createExpense(tripId, payload);
    const state = async () => ({
      expenses: await count('expenses'),
      receipts: await count('expensecreaterequests'),
      ...(await effects()),
    });

    it.each(SPELLING_PAIRS)(
      'replays a receipt stored for %s when the retry is sent as %s, without another expense',
      async (stored, retried) => {
        const payload = body({ client_request_id: stored });
        const original = await acceptedEarlier(payload);
        const committed = receiptFields(await mobileExpense(hex(amy), tripId, original.id));
        const before = await state();
        const retry = { ...payload, client_request_id: retried };

        expect(await web(retry)).toEqual({ success: true, data: original });
        expect(await create(retry)).toEqual(committed);
        expect(await lookup(retried)).toEqual({ status: 'committed', expense: committed });
        expect(await state()).toEqual(before);
      }
    );

    it.each(SPELLING_PAIRS)(
      'answers another payload under a key stored for %s with a conflict when sent as %s',
      async (stored, retried) => {
        const payload = body({ client_request_id: stored });
        await acceptedEarlier(payload);
        const changed = { ...payload, client_request_id: retried, description: 'Changed' };
        expect(await web(changed)).toMatchObject({ success: false, code: 'CONFLICT' });
        await expect(create(changed)).rejects.toMatchObject({
          status: 409,
          code: 'IDEMPOTENCY_CONFLICT',
        });
        expect(await count('expenses')).toBe(1);
      }
    );

    it.each(SPELLING_PAIRS)(
      'does not bring an expense back that was stored for %s and deleted, when retried as %s',
      async (stored, retried) => {
        const payload = body({ client_request_id: stored });
        const original = await acceptedEarlier(payload);
        expect(await deleteExpense(tripId, original.id)).toMatchObject({ success: true });
        const retry = { ...payload, client_request_id: retried };
        expect(await web(retry)).toEqual({ success: true, data: original });
        expect(await create(retry)).toMatchObject({ id: original.id });
        expect(await count('expenses')).toBe(0);
        expect(await lookup(retried)).toMatchObject({
          status: 'committed',
          expense: { id: original.id },
        });
      }
    );

    it.each([
      [UPPER, LOWER],
      [MIXED, LOWER],
      [MIXED, MIXED_2],
      [LOWER, MIXED],
    ])(
      'shows a key stored for %s, asked for as %s, only to the member who used it while they belong',
      async (stored, asked) => {
        const payload = body({ client_request_id: stored, payer_id: hex(bob) });
        const original = await acceptedEarlier(payload, bob);
        expect(await lookup(asked, amy)).toEqual({ status: 'not_found' });
        expect(await lookup(asked, bob)).toMatchObject({
          status: 'committed',
          expense: { id: original.id },
        });
        await Trip.updateOne({ _id: tripId }, { $pull: { members: { user: bob } } });
        await expect(lookup(asked, bob)).rejects.toMatchObject({ status: 404 });
        await expect(create({ ...payload, client_request_id: asked }, bob)).rejects.toMatchObject({
          status: 404,
        });
        mocks.session.mockResolvedValue({ userId: hex(bob) });
        expect(await web({ ...payload, client_request_id: asked })).toMatchObject({
          success: false,
          code: 'NOT_FOUND',
        });
        expect(await count('expenses')).toBe(1);
      }
    );

    it('stores new receipts exactly as earlier versions did, so an older server finds them', async () => {
      for (const key of [randomUUID(), randomUUID().toUpperCase(), MIXED]) {
        const payload = body({ client_request_id: key });
        const viaMobile = await create(payload);
        const viaWeb = await web({
          ...payload,
          client_request_id: key.toLowerCase() === key ? key.toUpperCase() : key.toLowerCase(),
        });
        expect(viaWeb.success).toBe(true);
        // The retry in the other case is the same request, so there is still only one receipt.
        expect(
          await receipts().countDocuments({
            _id: { $regex: `^${tripId}:${hex(amy)}:${key}$`, $options: 'i' },
          })
        ).toBe(1);
        const stored = await receipts().findOne({ _id: `${tripId}:${hex(amy)}:${key}` });
        const expected = earlierReceipt(amy, payload, viaMobile);
        expect(stored?.fingerprint).toBe(expected.fingerprint);
        expect(stored?.data).toMatchObject({ id: viaMobile.id });
      }
    });
  });

  describe('a key in different letter cases is one key', () => {
    const receipts = () =>
      db().collection<{ _id: string; trip: mongo.ObjectId }>('expensecreaterequests');
    const web = (payload: Payload) => createExpense(tripId, payload);
    const state = async () => ({
      expenses: await count('expenses'),
      receipts: await count('expensecreaterequests'),
      ...(await effects()),
    });

    // The accepted request is the one this version stored itself, spelled `first`.
    it.each(SPELLING_PAIRS)(
      'a request first sent as %s is found, replayed, refused when changed and kept after deletion as %s',
      async (first, later) => {
        const payload = body({ client_request_id: first });
        const original = await create(payload);

        expect(await lookup(later)).toEqual({ status: 'committed', expense: original });
        const settled = await state();
        const retry = { ...payload, client_request_id: later };
        expect(await create(retry)).toEqual(original);
        expect(await web(retry)).toMatchObject({ success: true, data: { id: original.id } });
        expect(await state()).toEqual(settled);

        const changed = { ...retry, description: 'Changed' };
        await expect(create(changed)).rejects.toMatchObject({
          status: 409,
          code: 'IDEMPOTENCY_CONFLICT',
        });
        expect(await web(changed)).toMatchObject({ success: false, code: 'CONFLICT' });
        expect(await state()).toEqual(settled);

        expect(await deleteExpense(tripId, original.id)).toMatchObject({ success: true });
        expect(await create(retry)).toEqual(original);
        expect(await web(retry)).toMatchObject({ success: true, data: { id: original.id } });
        expect(await lookup(later)).toEqual({ status: 'committed', expense: original });
        expect(await count('expenses')).toBe(0);

        // One receipt, still keyed as the first request spelled it.
        expect(await count('expensecreaterequests')).toBe(1);
        expect(await receipts().findOne({ _id: `${tripId}:${hex(amy)}:${first}` })).toMatchObject({
          data: { id: original.id },
        });
      }
    );

    it('commits once when sixteen different spellings of a key arrive together from both adapters', async () => {
      // A UUID made of letters wherever the format allows one, so there are many spellings.
      const letters = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
      let seed = 0x2545f491;
      const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
      const spellings = Array.from({ length: 16 }, () =>
        [...letters].map((char) => (next() & 0x10000 ? char.toUpperCase() : char)).join('')
      );
      expect(new Set(spellings).size).toBe(16);
      const payload = body({ client_request_id: spellings[0] });

      const outcomes = await Promise.all(
        spellings.map((spelling, index) =>
          index % 2
            ? create({ ...payload, client_request_id: spelling })
            : web({ ...payload, client_request_id: spelling })
        )
      );
      const ids = outcomes.map((outcome) =>
        'success' in outcome ? (outcome.success ? outcome.data.id : 'failed') : outcome.id
      );
      expect(new Set(ids).size).toBe(1);
      expect(await state()).toEqual({ expenses: 1, receipts: 1, notifications: 1, activity: 1 });
      for (const spelling of spellings)
        expect(await lookup(spelling)).toMatchObject({
          status: 'committed',
          expense: { id: ids[0] },
        });
    });

    it('keeps the search for another spelling inside this member’s receipts of this trip', async () => {
      const key = randomUUID();
      const scope = { tripId, actorId: hex(amy) };
      // Many receipts of other trips and members, and a few of this member in this trip.
      const idOf = (trip: string, actor: string) => `${trip}:${actor}:${randomUUID()}`;
      const mine = Array.from({ length: 30 }, () => idOf(tripId, hex(amy)));
      const others = [
        ...Array.from({ length: 30 }, () => idOf(tripId, hex(bob))),
        ...Array.from({ length: 3000 }, () => idOf(hex(oid()), hex(oid()))),
      ];
      await receipts().insertMany(
        [...mine, ...others].map((_id) => ({ _id, trip: new mongo.ObjectId(tripId) })) as never
      );

      type Stage = { stage: string; indexName?: string; inputStage?: Stage };
      const stagesOf = (stage?: Stage): string[] =>
        stage
          ? [
              `${stage.stage}${stage.indexName ? `:${stage.indexName}` : ''}`,
              ...stagesOf(stage.inputStage),
            ]
          : [];
      const explained = async (filter: object) => {
        const plan = await receipts()
          .find(filter, { sort: { _id: 1 }, limit: 1 })
          .explain('executionStats');
        return {
          stages: stagesOf(plan.queryPlanner.winningPlan as Stage),
          stats: plan.executionStats as { nReturned: number; totalKeysExamined: number },
        };
      };

      // The key has no receipt, so the whole range has to be read.
      const bounded = await explained(receiptSearch(scope, key));
      expect(bounded.stages).toContain('IXSCAN:_id_');
      expect(bounded.stages).not.toContain('COLLSCAN');
      expect(bounded.stats.nReturned).toBe(0);
      expect(bounded.stats.totalKeysExamined).toBeLessThanOrEqual(mine.length + 1);

      // The same pattern without the range reads (nearly) every id: this is what the range avoids.
      const { $regex, $options } = receiptSearch(scope, key)._id;
      const unbounded = await explained({ _id: { $regex, $options } });
      expect(unbounded.stats.totalKeysExamined).toBeGreaterThan(3000);
    });
  });

  describe('amount limit', () => {
    const everyone = () => [hex(amy), hex(bob), hex(cara)];
    const cents = (amount: number) => Math.round(amount * 100);
    const nonZero = (entries: [string, number][]) =>
      Object.fromEntries(entries.filter(([, value]) => value !== 0));

    it.each([
      MAX_EXPENSE_AMOUNT,
      999_999_999.99,
      999_999_999.97,
      333_333_333.33,
      123_456_789.01,
      0.01,
    ])(
      'keeps %d exact from the preview to the stored expense, every reader and the settlement',
      async (amount) => {
        const preview = await mobileExpensePreview(
          jsonRequest({ amount, member_ids: everyone() }),
          hex(amy),
          tripId
        );
        expect(preview.amount).toBe(amount);
        const shares = preview.splits.map((split) => split.shareAmount);
        expect(shares.reduce((total, share) => total + cents(share), 0)).toBe(cents(amount));

        const created = await create(
          body({
            original_amount: amount,
            splits: preview.splits.map((split) => ({
              user_id: split.userId,
              share_amount: split.shareAmount,
            })),
          })
        );
        expect(created.amount).toBe(amount);
        expect(created.originalAmount).toBe(amount);
        expect(created.splits.map((split) => split.shareAmount)).toEqual(shares);

        // What the database holds, read without any mapper of the application.
        const raw = await db()
          .collection('expenses')
          .findOne({ _id: new mongo.ObjectId(created.id) });
        expect(raw?.amount).toBe(amount);
        expect(raw?.originalAmount).toBe(amount);
        expect(raw?.splits.map((split: { shareAmount: number }) => split.shareAmount)).toEqual(
          shares
        );

        const listed = await getExpenses(tripId);
        expect(
          listed.success &&
            listed.data.map((item) => [item.amount, item.splits.map((s) => s.share_amount)])
        ).toEqual([[amount, shares]]);
        expect(receiptFields(await mobileExpense(hex(amy), tripId, created.id))).toEqual(created);

        const settlement = await mobileSettlement(hex(amy), tripId);
        expect(settlement.totalExpenses).toBe(amount);
        expect(
          nonZero(settlement.balances.map((entry) => [entry.displayName, cents(entry.balance)]))
        ).toEqual(
          nonZero([
            ['Amy', cents(amount) - cents(shares[0])],
            ['Bob', -cents(shares[1])],
            ['Cara', -cents(shares[2])],
          ])
        );
      }
    );

    it('converts a foreign amount to exactly the largest TWD amount', async () => {
      const result = await createExpense(tripId, {
        payer_id: hex(amy),
        original_amount: 50_000_000_000,
        currency: 'JPY',
        exchange_rate: 0.02,
        description: 'Island',
        category: 'other',
        date: '2026-10-03',
        splits: [
          { user_id: hex(amy), share_amount: 500_000_000 },
          { user_id: hex(bob), share_amount: 500_000_000 },
        ],
        client_request_id: randomUUID(),
      });
      expect(result).toMatchObject({ success: true, data: { amount: MAX_EXPENSE_AMOUNT } });
      const raw = await db()
        .collection('expenses')
        .findOne({ trip: new mongo.ObjectId(tripId) });
      expect(raw).toMatchObject({ amount: MAX_EXPENSE_AMOUNT, originalAmount: 50_000_000_000 });
    });

    it.each([
      ['just above the limit', 1_000_000_000.01, [500_000_000.01, 500_000_000]],
      ['the amount that used to drift by a cent', 10_000_000_000_000, [5e12, 5e12]],
      ['beyond the safe integers', 1e15, [5e14, 5e14]],
    ])('refuses %s everywhere before anything is written', async (_label, amount, halves) => {
      await expect(
        mobileExpensePreview(jsonRequest({ amount, member_ids: everyone() }), hex(amy), tripId)
      ).rejects.toMatchObject({ status: 400 });
      const payload = body({
        original_amount: amount,
        splits: [
          { user_id: hex(amy), share_amount: halves[0] },
          { user_id: hex(bob), share_amount: halves[1] },
        ],
      });
      await expect(create(payload)).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_ERROR',
      });
      // Neither the Web schema nor the service's callers limit the amount: the service does.
      expect(await createExpense(tripId, payload)).toMatchObject({
        success: false,
        code: 'VALIDATION_ERROR',
      });
      await expect(
        createExpenseForActor(
          { tripId, actorId: hex(amy), input: createExpenseSchema.parse(payload) },
          mocks.after
        )
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

      expect(await count('expenses')).toBe(0);
      expect(await count('expensecreaterequests')).toBe(0);
      expect(await effects()).toEqual({ notifications: 0, activity: 0 });
      // The key was never used up, so the corrected request goes through.
      expect(
        await create({ ...payload, original_amount: 100, splits: body().splits })
      ).toMatchObject({ amount: 100 });
    });
  });

  it('reads Web expenses with foreign currency and shows mobile expenses to Web with equal amounts', async () => {
    const web = await createExpense(tripId, {
      payer_id: hex(bob),
      original_amount: 3000,
      currency: 'JPY',
      exchange_rate: 0.0333,
      description: 'Ramen',
      category: 'food',
      date: '2026-10-02',
      splits: [
        { user_id: hex(amy), share_amount: 60 },
        { user_id: hex(bob), share_amount: 39.9 },
      ],
      client_request_id: randomUUID(),
    });
    expect(web.success).toBe(true);
    const mobile = await create(body());
    const list = await mobileExpenses(
      hex(amy),
      tripId,
      new URL(`https://example.com/api/v1/trips/${tripId}/expenses`)
    );
    // Newest date first: the mobile expense (2026-10-03) precedes the Web one (2026-10-02).
    expect(list.items.map((item) => item.id)).toEqual([mobile.id, web.success ? web.data.id : '']);
    expect(list.items[1]).toMatchObject({ amount: 99.9, originalAmount: 3000, currency: 'JPY' });
    const all = await getExpenses(tripId);
    expect(all.success && all.data.map((item) => [item.id, item.amount])).toEqual([
      [mobile.id, 100],
      [web.success ? web.data.id : '', 99.9],
    ]);
  });
});
