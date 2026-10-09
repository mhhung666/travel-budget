// @vitest-environment node
import mongoose, { Types } from 'mongoose';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { expenseCategories } from '@travel-budget/contracts';
import { EXPENSE_CATEGORIES } from '@/models/Expense';

const mocks = vi.hoisted(() => ({ membership: vi.fn(), find: vi.fn(), findOne: vi.fn() }));
vi.mock('@/lib/permissions', () => ({ getTripMembership: mocks.membership }));
vi.mock('@/models', () => ({ Expense: { find: mocks.find, findOne: mocks.findOne } }));
import * as reads from '@/lib/mobile/expenses';
import { withLedgerV2 } from '@/lib/ledger';

const viewer = '507f191e810c19729de860ea';
const bob = '507f191e810c19729de860eb';
const tripId = '507f1f77bcf86cd799439011';
const url = (query = '') => new URL(`https://example.com/api/v2/trips/${tripId}/expenses${query}`);

// Native routes are v2 only, so every read runs inside the v2 ledger context.
const mobileExpenses = (...args: Parameters<typeof reads.mobileExpenses>) =>
  withLedgerV2(() => reads.mobileExpenses(...args));
const mobileExpense = (...args: Parameters<typeof reads.mobileExpense>) =>
  withLedgerV2(() => reads.mobileExpense(...args));
const { encodeExpenseCursor } = reads;
// The authorization re-read finds a TWD trip whose children all match its ledger.
const previousDb = Object.getOwnPropertyDescriptor(mongoose.connection, 'db');
Object.defineProperty(mongoose.connection, 'db', {
  configurable: true,
  value: {
    collection: (name: string) => ({
      findOne: async () => (name === 'trips' ? { _id: new Types.ObjectId(tripId) } : null),
    }),
  },
});
afterAll(() => {
  if (previousDb) Object.defineProperty(mongoose.connection, 'db', previousDb);
  else Reflect.deleteProperty(mongoose.connection, 'db');
});

function chain(data: unknown) {
  const query = {
    sort: vi.fn(),
    limit: vi.fn(),
    select: vi.fn(),
    populate: vi.fn(),
    lean: vi.fn().mockResolvedValue(data),
  };
  for (const method of [query.sort, query.limit, query.select, query.populate])
    method.mockReturnValue(query);
  return query;
}
const person = (id: string, displayName: string) => ({
  _id: new Types.ObjectId(id),
  displayName,
  // Never selected in production; present here to prove the adapter would not forward it.
  username: `login-${displayName}`,
});
function doc(index: number, overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(`507f191e810c19729de86${index.toString(16).padStart(3, '0')}`),
    trip: tripId,
    payer: person(viewer, 'Amy'),
    amount: 100,
    originalAmount: 100,
    currency: 'TWD',
    exchangeRate: 1,
    description: `Lunch ${index}`,
    category: 'food',
    date: new Date('2026-10-02T00:00:00.000Z'),
    createdAt: new Date(`2026-10-02T08:00:${String(index % 60).padStart(2, '0')}.123Z`),
    splits: [
      { user: person(viewer, 'Amy'), shareAmount: 33.34 },
      { user: person(bob, 'Bob'), shareAmount: 33.33 },
      { user: person('507f191e810c19729de860ec', 'Cara'), shareAmount: 33.33 },
    ],
    // Private fields that must never reach the mobile DTO.
    attachments: [{ key: 'receipts/private-key.jpg', contentType: 'image/jpeg', size: 1 }],
    tags: ['tag-secret'],
    createdBy: viewer,
    ...overrides,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership.mockResolvedValue({ tripId, role: 'member' });
});

describe('mobile expense list', () => {
  it('keeps the mobile category list in sync with the stored categories', () => {
    expect([...expenseCategories]).toEqual([...EXPENSE_CATEGORIES]);
  });

  it('returns only whitelisted fields and keeps the existing cent rounding', async () => {
    mocks.find.mockReturnValue(
      chain([
        doc(1, { amount: 30.004, originalAmount: 4500, currency: 'JPY', exchangeRate: 0.0067 }),
      ])
    );
    const result = await mobileExpenses(viewer, tripId, url());
    expect(result).toEqual({
      items: [
        {
          id: expect.stringMatching(/^[a-f\d]{24}$/),
          date: '2026-10-02',
          description: 'Lunch 1',
          category: 'food',
          payerId: viewer,
          payerName: 'Amy',
          amount: 30,
          originalAmount: 4500,
          currency: 'JPY',
        },
      ],
      nextCursor: null,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private-key|tag-secret|login-|createdBy|attachments|hashCode|splits|trip/
    );
  });

  it('reads one authorized trip with a bounded projection and stable descending order', async () => {
    const query = chain([]);
    mocks.find.mockReturnValue(query);
    await mobileExpenses(viewer, tripId, url());
    expect(mocks.membership).toHaveBeenCalledWith(viewer, tripId);
    expect(mocks.find).toHaveBeenCalledWith({ trip: tripId });
    expect(query.sort).toHaveBeenCalledWith({ date: -1, createdAt: -1, _id: -1 });
    expect(query.limit).toHaveBeenCalledWith(21);
    expect(query.select.mock.calls[0][0]).not.toMatch(/attachments|tags|createdBy|expenseDelivery/);
    expect(query.populate).toHaveBeenCalledWith('payer', 'displayName isVirtual');
    expect(query.populate).toHaveBeenCalledWith('splits.user', 'displayName isVirtual');
  });

  it('pages 20 rows at a time and the cursor resumes after the last returned row', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => doc(index + 1));
    mocks.find.mockReturnValue(chain(rows));
    const first = await mobileExpenses(viewer, tripId, url());
    expect(first.items).toHaveLength(20);
    expect(first.items.at(-1)?.id).toBe(rows[19]._id.toString());
    expect(first.nextCursor).toBe(
      `${rows[19].date.getTime()}.${rows[19].createdAt.getTime()}.${rows[19]._id.toString()}`
    );

    const query = chain([rows[20]]);
    mocks.find.mockReturnValue(query);
    const second = await mobileExpenses(viewer, tripId, url(`?cursor=${first.nextCursor}`));
    expect(second).toMatchObject({ items: [{ id: rows[20]._id.toString() }], nextCursor: null });
    const filter = mocks.find.mock.calls[1][0];
    expect(filter.trip).toBe(tripId);
    expect(filter.$or).toEqual([
      { date: { $lt: rows[19].date } },
      { date: rows[19].date, createdAt: { $lt: rows[19].createdAt } },
      { date: rows[19].date, createdAt: rows[19].createdAt, _id: { $lt: rows[19]._id } },
    ]);
  });

  it('does not report another page for exactly 20 rows', async () => {
    mocks.find.mockReturnValue(chain(Array.from({ length: 20 }, (_, index) => doc(index + 1))));
    expect((await mobileExpenses(viewer, tripId, url())).nextCursor).toBeNull();
  });

  it('breaks ties on identical date and createdAt by id', async () => {
    const stamp = { date: new Date('2026-10-02'), createdAt: new Date('2026-10-02T08:00:00.000Z') };
    const [a, b] = [doc(7, stamp), doc(6, stamp)];
    mocks.find.mockReturnValue(chain([a]));
    await mobileExpenses(viewer, tripId, url(`?cursor=${encodeExpenseCursor(b)}`));
    const [, , tie] = mocks.find.mock.calls[0][0].$or;
    expect(tie).toEqual({ date: stamp.date, createdAt: stamp.createdAt, _id: { $lt: b._id } });
  });

  it.each([
    '?cursor=',
    '?cursor=abc',
    '?cursor=1.2.3',
    `?cursor=1.2.${'g'.repeat(24)}`,
    `?cursor=${'9'.repeat(16)}.1.${bob}`,
    `?cursor=1.2.${bob}&cursor=1.2.${bob}`,
    `?cursor=-.2.${bob}`,
  ])('rejects the invalid cursor %s before touching the database', async (query) => {
    await expect(mobileExpenses(viewer, tripId, url(query))).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(mocks.membership).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('shows foreign-currency, unusual-category and legacy rows without failing the page', async () => {
    mocks.find.mockReturnValue(
      chain([
        doc(1, { category: 'mystery', originalAmount: undefined, currency: undefined }),
        doc(2, {
          category: null,
          payer: null,
          originalAmount: Number.NaN,
          exchangeRate: undefined,
        }),
      ])
    );
    const { items } = await mobileExpenses(viewer, tripId, url());
    expect(items[0]).toMatchObject({
      category: 'other',
      originalAmount: 100,
      currency: 'TWD',
    });
    expect(items[1]).toMatchObject({ category: 'other', payerId: null, payerName: '' });
  });

  it.each([
    ['non-member', null, tripId],
    ['malformed id', { tripId, role: 'member' }, 'not-an-id'],
    ['share code', { tripId, role: 'member' }, 'abc12345'],
    ['12-character string', { tripId, role: 'member' }, 'abcdefghijkl'],
  ])('rejects a %s with 404 and never reads expenses', async (_name, membership, id) => {
    mocks.membership.mockResolvedValue(membership);
    await expect(mobileExpenses(viewer, id, url())).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(mocks.find).not.toHaveBeenCalled();
  });
});

describe('mobile expense detail', () => {
  it('returns original currency, rate and per-member shares without private fields', async () => {
    const query = chain(
      doc(1, {
        amount: 100,
        originalAmount: 3000,
        currency: 'JPY',
        exchangeRate: 0.0333333,
        splits: [
          { user: person(viewer, 'Amy'), shareAmount: 33.34 },
          { user: person(bob, 'Virtual Bob'), shareAmount: 33.33 },
          { user: person('507f191e810c19729de860ec', 'Cara'), shareAmount: 33.33 },
        ],
      })
    );
    mocks.findOne.mockReturnValue(query);
    const detail = await mobileExpense(viewer, tripId, '507f191e810c19729de86001');
    expect(mocks.findOne).toHaveBeenCalledWith({ _id: '507f191e810c19729de86001', trip: tripId });
    expect(detail).toMatchObject({
      amount: 100,
      originalAmount: 3000,
      currency: 'JPY',
      exchangeRate: 0.0333333,
      splits: [
        { userId: viewer, displayName: 'Amy', shareAmount: 33.34 },
        { userId: bob, displayName: 'Virtual Bob', shareAmount: 33.33 },
        { userId: '507f191e810c19729de860ec', displayName: 'Cara', shareAmount: 33.33 },
      ],
    });
    expect(detail.splits.reduce((sum, split) => sum + split.shareAmount, 0)).toBeCloseTo(100, 10);
    expect(JSON.stringify(detail)).not.toMatch(/private-key|tag-secret|login-|createdBy/);
  });

  it('applies the existing legacy share normalization', async () => {
    mocks.findOne.mockReturnValue(
      chain(
        doc(1, {
          amount: 0.01,
          splits: [
            { user: person(viewer, 'Amy'), shareAmount: 0.00333 },
            { user: person(bob, 'Bob'), shareAmount: 0.00333 },
            { user: person('507f191e810c19729de860ec', 'Cara'), shareAmount: 0.00334 },
          ],
        })
      )
    );
    const detail = await mobileExpense(viewer, tripId, '507f191e810c19729de86001');
    // The cent goes to the largest remainder, exactly as Web's toExpenseDto does.
    expect(detail.splits.map((split) => split.shareAmount)).toEqual([0, 0, 0.01]);
  });

  it('keeps splits whose user no longer resolves', async () => {
    mocks.findOne.mockReturnValue(chain(doc(1, { splits: [{ user: null, shareAmount: 100 }] })));
    const detail = await mobileExpense(viewer, tripId, '507f191e810c19729de86001');
    expect(detail.splits).toEqual([{ userId: null, displayName: '', shareAmount: 100 }]);
  });

  it('returns 404 for an expense outside the trip, a missing expense and a bad id', async () => {
    mocks.findOne.mockReturnValue(chain(null));
    await expect(mobileExpense(viewer, tripId, '507f191e810c19729de86001')).rejects.toMatchObject({
      status: 404,
    });
    expect(mocks.findOne).toHaveBeenCalledWith({ _id: '507f191e810c19729de86001', trip: tripId });
    mocks.findOne.mockClear();
    await expect(mobileExpense(viewer, tripId, 'nope')).rejects.toMatchObject({ status: 404 });
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it('authorizes the trip membership before reading the expense', async () => {
    mocks.membership.mockResolvedValue(null);
    await expect(mobileExpense(viewer, tripId, '507f191e810c19729de86001')).rejects.toMatchObject({
      status: 404,
    });
    expect(mocks.findOne).not.toHaveBeenCalled();
  });
});

it('exposes virtual identity only on authorized reads, keyed by ID even with duplicate names', async () => {
  const virtual = { ...person(bob, 'Amy'), isVirtual: true };
  const row = doc(1, {
    payer: virtual,
    splits: [
      { user: { ...person(viewer, 'Amy'), isVirtual: false }, shareAmount: 20.01 },
      { user: virtual, shareAmount: 79.99 },
      { user: null, shareAmount: 0 },
    ],
  });
  mocks.find.mockReturnValue(chain([row]));
  expect((await mobileExpenses(viewer, tripId, url())).items[0]).toMatchObject({
    payerId: bob,
    payerIsVirtual: true,
  });
  mocks.findOne.mockReturnValue(chain(row));
  const detail = await mobileExpense(viewer, tripId, row._id.toString());
  expect(detail.splits).toEqual([
    { userId: viewer, displayName: 'Amy', shareAmount: 20.01, isVirtual: false },
    { userId: bob, displayName: 'Amy', shareAmount: 79.99, isVirtual: true },
    { userId: null, displayName: '', shareAmount: 0 },
  ]);
  expect(JSON.stringify(detail)).not.toMatch(/username|login-|private-key|tag-secret/);
});
