// @vitest-environment node
import { Types, mongo } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expenseCategories } from '@travel-budget/contracts';

const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  findTrip: vi.fn(),
  create: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock('@/lib/permissions', () => ({ getTripMembership: mocks.membership }));
vi.mock('@/models', () => ({ Trip: { findById: mocks.findTrip }, Expense: {} }));
vi.mock('@/lib/expenseCreate', () => ({ createExpenseForActor: mocks.create }));
vi.mock('@/lib/expenseCreateRequest', () => ({ readExpenseCreateReceipt: mocks.receipt }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
import { mobileExpenseOptions, mobileExpensePreview } from '@/lib/mobile/expenseOptions';
import {
  mobileCreateExpense,
  mobileExpenseRequest,
  toExpenseWriteError,
} from '@/lib/mobile/expenseWrite';
import { ApiError, apiResponse } from '@/lib/mobile/http';
import { RetiredBlobError } from '@/lib/blobReferences';
import { logger } from '@/lib/logger';
import { TripWriteError } from '@/lib/tripWriteTransaction';

const AMY = '507f191e810c19729de860ea';
const BOB = '507f191e810c19729de860eb';
const CARA = '507f191e810c19729de860ec';
const GONE = '507f191e810c19729de860ed';
const OUTSIDER = '507f191e810c19729de860ee';
const TRIP = '507f1f77bcf86cd799439011';
const KEY = '017fd635-8dc2-41c1-bf6a-ecbe40f18f90';
const after = vi.fn();

function members(
  entries: [id: string, name: string, joinedAt: string, extra?: Record<string, unknown>][]
) {
  return entries.map(([id, displayName, joinedAt, extra]) => ({
    // Only the display name is selected in production; login names must never be forwarded.
    user: { _id: new Types.ObjectId(id), displayName, username: `login-${displayName}`, ...extra },
    joinedAt: new Date(joinedAt),
  }));
}
function tripQuery(value: unknown) {
  const query = { select: vi.fn(), populate: vi.fn(), lean: vi.fn().mockResolvedValue(value) };
  query.select.mockReturnValue(query);
  query.populate.mockReturnValue(query);
  return query;
}
const standardMembers = () =>
  members([
    [AMY, 'Amy', '2026-09-01T00:00:00.000Z'],
    [BOB, 'Bob', '2026-09-02T00:00:00.000Z'],
    [CARA, 'Cara', '2026-09-03T00:00:00.000Z'],
  ]);
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://example.com/api/v1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const expenseBody = (overrides: Record<string, unknown> = {}) => ({
  client_request_id: KEY,
  payer_id: AMY,
  original_amount: 100,
  currency: 'TWD',
  exchange_rate: 1,
  description: '  Dinner  ',
  category: 'food',
  date: '2026-10-03',
  splits: [
    { user_id: AMY, share_amount: 33.34 },
    { user_id: BOB, share_amount: 33.33 },
    { user_id: CARA, share_amount: 33.33 },
  ],
  ...overrides,
});
// The Web DTO the shared service returns; everything private is present so leaks would show.
const webDto = (overrides: Record<string, unknown> = {}) => ({
  id: '507f1f77bcf86cd799439099',
  trip_id: TRIP,
  amount: 100,
  original_amount: 100,
  currency: 'TWD',
  exchange_rate: 1,
  description: 'Dinner',
  category: 'food',
  date: '2026-10-03',
  created_at: '2026-10-03T08:00:00.000Z',
  payer_id: AMY,
  payer_name: 'Amy',
  splits: [
    { user_id: AMY, share_amount: 33.34, username: 'login-Amy', display_name: 'Amy' },
    { user_id: BOB, share_amount: 33.33, username: 'login-Bob', display_name: 'Bob' },
    { user_id: CARA, share_amount: 33.33, username: 'login-Cara', display_name: 'Cara' },
  ],
  attachments: [{ key: 'receipts/private.jpg', content_type: 'image/jpeg', size: 1 }],
  itinerary_day_ids: ['507f1f77bcf86cd799439098'],
  tags: ['secret-tag'],
  ...overrides,
});
const status = async (promise: Promise<unknown>) => {
  const response = await apiResponse(() => promise);
  return {
    status: response.status,
    retryAfter: response.headers.get('Retry-After'),
    body: await response.json(),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership.mockResolvedValue({ tripId: TRIP, role: 'member' });
  mocks.findTrip.mockReturnValue(tripQuery({ members: standardMembers() }));
  mocks.create.mockResolvedValue({ replayed: false, data: webDto() });
  mocks.receipt.mockResolvedValue(undefined);
});

describe('expense options', () => {
  it('lists members earliest-joined first with stable ties, without names that cannot sign in', async () => {
    mocks.findTrip.mockReturnValue(
      tripQuery({
        members: [
          ...members([
            [CARA, 'Cara', '2026-09-03T00:00:00.000Z'],
            [BOB, 'Bob', '2026-09-02T00:00:00.000Z'],
            [AMY, 'Amy', '2026-09-02T00:00:00.000Z', { isVirtual: true }],
          ]),
          { user: null, joinedAt: new Date('2026-08-01T00:00:00.000Z') },
        ],
      })
    );
    const options = await mobileExpenseOptions(AMY, TRIP);
    // Bob and Amy joined together: stored order decides. The dangling reference is skipped.
    expect(options.members).toEqual([
      { id: BOB, displayName: 'Bob', isVirtual: false },
      { id: AMY, displayName: 'Amy', isVirtual: true },
      { id: CARA, displayName: 'Cara', isVirtual: false },
    ]);
    expect(options.categories).toEqual([...expenseCategories]);
    expect(JSON.stringify(options)).not.toContain('login-');
  });

  it('answers 404 when the trip disappears between authorization and reading', async () => {
    mocks.findTrip.mockReturnValueOnce(tripQuery(null));
    await expect(mobileExpenseOptions(AMY, TRIP)).rejects.toMatchObject({ status: 404 });
  });

  it('answers 404 for strangers and malformed trip ids without reading members', async () => {
    mocks.membership.mockResolvedValueOnce(null);
    await expect(mobileExpenseOptions(OUTSIDER, TRIP)).rejects.toMatchObject({ status: 404 });
    await expect(mobileExpenseOptions(AMY, 'abc')).rejects.toMatchObject({ status: 404 });
    expect(mocks.findTrip).not.toHaveBeenCalled();
  });
});

describe('expense preview', () => {
  const preview = (body: unknown, user = AMY) =>
    mobileExpensePreview(post(body), user, TRIP) as Promise<{
      amount: number;
      splits: { userId: string; displayName: string; shareAmount: number }[];
    }>;

  it('gives 100 among three members 33.34 / 33.33 / 33.33 in member order', async () => {
    expect(await preview({ amount: 100, member_ids: [AMY, BOB, CARA] })).toEqual({
      amount: 100,
      splits: [
        { userId: AMY, displayName: 'Amy', shareAmount: 33.34 },
        { userId: BOB, displayName: 'Bob', shareAmount: 33.33 },
        { userId: CARA, displayName: 'Cara', shareAmount: 33.33 },
      ],
    });
  });

  it('is independent of the order members were sent in', async () => {
    const forward = await preview({ amount: 100, member_ids: [AMY, BOB, CARA] });
    expect(await preview({ amount: 100, member_ids: [CARA, BOB, AMY] })).toEqual(forward);
    expect(await preview({ amount: 100, member_ids: [BOB, CARA, AMY] })).toEqual(forward);
  });

  it('keeps 0.01 split three ways at 0.01 in total and follows the chosen subset', async () => {
    const tiny = await preview({ amount: 0.01, member_ids: [AMY, BOB, CARA] });
    expect(tiny.splits.map((split) => split.shareAmount)).toEqual([0.01, 0, 0]);
    const subset = await preview({ amount: 0.03, member_ids: [CARA, BOB] });
    expect(subset.splits.map((split) => [split.userId, split.shareAmount])).toEqual([
      [BOB, 0.02],
      [CARA, 0.01],
    ]);
  });

  it('always distributes the exact total, with leftover cents on the earliest members', async () => {
    const roster = Array.from({ length: 7 }, (_, index) => ({
      id: new Types.ObjectId().toHexString(),
      name: `M${index}`,
    }));
    mocks.findTrip.mockReturnValue(
      tripQuery({
        members: members(
          roster.map((member, index) => [
            member.id,
            member.name,
            `2026-09-0${index + 1}T00:00:00.000Z`,
          ])
        ),
      })
    );
    for (let count = 1; count <= 7; count += 1) {
      for (const cents of [
        1, 2, 3, 7, 99, 100, 101, 3333, 10000, 123457, 9999999, 99999999997, 99999999999,
        100000000000,
      ]) {
        const result = await preview({
          amount: cents / 100,
          member_ids: roster.slice(0, count).map((member) => member.id),
        });
        const shares = result.splits.map((split) => Math.round(split.shareAmount * 100));
        expect(shares.reduce((sum, share) => sum + share, 0)).toBe(cents);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
        // Larger shares never come after smaller ones: the extra cents go to the front.
        expect([...shares].sort((a, b) => b - a)).toEqual(shares);
      }
    }
  });

  it('previews the largest amount to the cent, not a cent more', async () => {
    const largest = await preview({ amount: 1_000_000_000, member_ids: [AMY, BOB, CARA] });
    expect(largest.amount).toBe(1_000_000_000);
    expect(largest.splits.map((split) => split.shareAmount)).toEqual([
      333_333_333.34, 333_333_333.33, 333_333_333.33,
    ]);
  });

  it('rejects strangers, duplicates, empty lists, bad amounts and unknown fields', async () => {
    for (const body of [
      { amount: 100, member_ids: [OUTSIDER] },
      { amount: 100, member_ids: [GONE] },
      { amount: 100, member_ids: [AMY, AMY] },
      { amount: 100, member_ids: [] },
      { amount: 0, member_ids: [AMY] },
      { amount: -5, member_ids: [AMY] },
      { amount: 0.001, member_ids: [AMY] },
      { amount: 33.345, member_ids: [AMY] },
      { amount: 1e21, member_ids: [AMY] },
      // Above the limit the backend's cent rounding drifts: 1e13 would come back as 1e13 + 0.01.
      { amount: 1_000_000_000.01, member_ids: [AMY] },
      { amount: 10_000_000_000_000, member_ids: [AMY] },
      { amount: '100', member_ids: [AMY] },
      { amount: 100, member_ids: [AMY], currency: 'TWD' },
      { member_ids: [AMY] },
    ])
      await expect(preview(body)).rejects.toMatchObject({ status: 400 });
  });

  it('checks membership before reading the body and enforces the body limits', async () => {
    mocks.membership.mockResolvedValueOnce(null);
    const stranger = post('{not json');
    await expect(mobileExpensePreview(stranger, OUTSIDER, TRIP)).rejects.toMatchObject({
      status: 404,
    });
    expect(stranger.bodyUsed).toBe(false);
    await expect(mobileExpensePreview(post(' '.repeat(9000)), AMY, TRIP)).rejects.toMatchObject({
      status: 413,
    });
    await expect(
      mobileExpensePreview(post('{}', { 'Content-Type': 'text/plain' }), AMY, TRIP)
    ).rejects.toMatchObject({ status: 415 });
  });
});

describe('expense creation adapter', () => {
  const create = (body: unknown, user = AMY, headers: Record<string, string> = {}) =>
    mobileCreateExpense(post(body, headers), user, TRIP, after);

  it('hands the shared service Web-schema input and returns a whitelisted detail', async () => {
    const result = await create(expenseBody());
    expect(mocks.create).toHaveBeenCalledOnce();
    const [command, schedule] = mocks.create.mock.calls[0];
    expect(schedule).toBe(after);
    expect(command).toEqual({
      tripId: TRIP,
      actorId: AMY,
      // Trimmed by the contract; defaults and field order come from the Web schema.
      input: expect.objectContaining({
        client_request_id: KEY,
        description: 'Dinner',
        currency: 'TWD',
        exchange_rate: 1,
      }),
    });
    expect(Object.keys(command.input)).toEqual([
      'client_request_id',
      'payer_id',
      'original_amount',
      'currency',
      'exchange_rate',
      'description',
      'category',
      'date',
      'splits',
    ]);
    expect(result).toEqual({
      id: '507f1f77bcf86cd799439099',
      date: '2026-10-03',
      description: 'Dinner',
      category: 'food',
      payerId: AMY,
      payerName: 'Amy',
      amount: 100,
      originalAmount: 100,
      currency: 'TWD',
      exchangeRate: 1,
      splits: [
        { userId: AMY, displayName: 'Amy', shareAmount: 33.34 },
        { userId: BOB, displayName: 'Bob', shareAmount: 33.33 },
        { userId: CARA, displayName: 'Cara', shareAmount: 33.33 },
      ],
    });
    const text = JSON.stringify(result);
    for (const secret of ['login-', 'receipts/', 'secret-tag', '507f1f77bcf86cd799439098'])
      expect(text).not.toContain(secret);
    for (const privateKey of ['attachments', 'tags', 'itinerary_day_ids', 'username'])
      expect(result).not.toHaveProperty(privateKey);
  });

  it('returns the same response for a replay', async () => {
    const first = await create(expenseBody());
    mocks.create.mockResolvedValueOnce({ replayed: true, data: webDto() });
    expect(await create(expenseBody())).toEqual(first);
  });

  it.each([
    ['unknown field', { attachments: [] }],
    ['tags', { tags: ['a'] }],
    ['itinerary days', { itinerary_day_ids: [] }],
    ['unsupported currency', { currency: 'ZZZ' }],
    ['other rate', { exchange_rate: 0.5 }],
    ['missing currency', { currency: undefined }],
    ['missing key', { client_request_id: undefined }],
    ['malformed key', { client_request_id: 'not-a-uuid' }],
    ['unknown category', { category: 'games' }],
    ['missing category', { category: undefined }],
    ['impossible date', { date: '2026-02-31' }],
    ['month 13', { date: '2026-13-01' }],
    ['date with time', { date: '2026-10-03T00:00:00.000Z' }],
    ['blank description', { description: '   ' }],
    ['overlong description', { description: 'x'.repeat(201) }],
    ['zero amount', { original_amount: 0 }],
    ['three decimals', { original_amount: 10.005 }],
    ['unsafe amount', { original_amount: 1e17 }],
    ['amount above the limit', { original_amount: 1_000_000_000.01 }],
    ['amount that drifted by a cent', { original_amount: 10_000_000_000_000 }],
    ['share above the limit', { splits: [{ user_id: AMY, share_amount: 1_000_000_000.01 }] }],
    ['string amount', { original_amount: '100' }],
    ['negative share', { splits: [{ user_id: AMY, share_amount: -1 }] }],
    ['fractional cent share', { splits: [{ user_id: AMY, share_amount: 100.001 }] }],
    ['no members', { splits: [] }],
    ['duplicate members', { splits: [expenseBody().splits[0], expenseBody().splits[0]] }],
    ['split extras', { splits: [{ user_id: AMY, share_amount: 100, note: 'x' }] }],
    ['malformed payer', { payer_id: 'amy' }],
  ])('rejects %s before touching the service', async (_label, overrides) => {
    await expect(create(expenseBody(overrides))).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('authorizes before it looks at the body and honours the body limits', async () => {
    mocks.membership.mockResolvedValueOnce(null);
    const stranger = post('{not json');
    await expect(mobileCreateExpense(stranger, OUTSIDER, TRIP, after)).rejects.toMatchObject({
      status: 404,
    });
    expect(stranger.bodyUsed).toBe(false);
    await expect(
      mobileCreateExpense(post(expenseBody({ description: 'x'.repeat(9000) })), AMY, TRIP, after)
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      mobileCreateExpense(post('{}', { 'Content-Type': 'text/plain' }), AMY, TRIP, after)
    ).rejects.toMatchObject({ status: 415 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe('G2b foreign preview and create boundaries', () => {
  const foreign = (amount = 100, exchange_rate = 0.2156789012345, currency = 'JPY') => ({
    amount,
    exchange_rate,
    currency,
    member_ids: [CARA, AMY, BOB],
  });
  it('echoes exact original currency/rate and uses the same original-cent weighting as Web', async () => {
    const preview = await mobileExpensePreview(post(foreign()), AMY, TRIP);
    expect(preview).toMatchObject({
      amount: 21.57,
      originalAmount: 100,
      currency: 'JPY',
      exchangeRate: 0.2156789012345,
    });
    expect(preview.splits.map((s) => s.userId)).toEqual([AMY, BOB, CARA]);
    expect(preview.splits.reduce((sum, s) => sum + Math.round(s.shareAmount * 100), 0)).toBe(2157);
    await mobileCreateExpense(
      post(
        expenseBody({
          currency: 'JPY',
          exchange_rate: 0.2156789012345,
          splits: preview.splits.map((s) => ({ user_id: s.userId, share_amount: s.shareAmount })),
        })
      ),
      AMY,
      TRIP,
      after
    );
    expect(mocks.create.mock.calls[0][0].input).toMatchObject({
      currency: 'JPY',
      exchange_rate: 0.2156789012345,
    });
  });
  it.each([
    [50_000_000_000, 0.02, 1_000_000_000],
    [0.01, 1e-7, 0],
    [0.01, 1e11, 1_000_000_000],
  ])(
    'supports original %s and rate %s without inventing precision rules',
    async (amount, rate, expected) => {
      const value = await mobileExpensePreview(post(foreign(amount, rate)), AMY, TRIP);
      expect(value.amount).toBe(expected);
      expect(value.exchangeRate).toBe(rate);
    }
  );
  it.each([
    foreign(100, Infinity),
    foreign(100, 0),
    foreign(100, -1),
    foreign(100, 1, 'ZZZ'),
    foreign(1e15, 1e-8),
    foreign(100, 1, 'jpy'),
    foreign(1_000_000_000, 2),
    foreign(1_000_000_000, 1e308),
    foreign(100, 2, 'TWD'),
    foreign(1.001, 1),
  ])('rejects invalid foreign preview before computing shares', async (body) => {
    await expect(mobileExpensePreview(post(body), AMY, TRIP)).rejects.toMatchObject({
      status: 400,
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('includes only the current trip currency settings and supported codes in member options', async () => {
    mocks.findTrip.mockReturnValue(
      tripQuery({
        members: standardMembers(),
        currencySettings: {
          defaultCurrency: 'JPY',
          currencies: [{ code: 'JPY', rate: 0.2156789012345 }],
        },
      })
    );
    const options = await mobileExpenseOptions(AMY, TRIP);
    expect(options.currencySettings).toEqual({
      default_currency: 'JPY',
      currencies: [{ code: 'JPY', rate: 0.2156789012345 }],
    });
    expect(options.supportedCurrencies).toContain('JPY');
    expect(JSON.stringify(options)).not.toContain('login-');
  });
});

describe('expense write error contract', () => {
  const failing = (error: unknown) => {
    mocks.create.mockRejectedValueOnce(error);
    return status(mobileCreateExpense(post(expenseBody()), AMY, TRIP, after));
  };

  it.each([
    [new TripWriteError('VALIDATION_ERROR'), 400, 'VALIDATION_ERROR'],
    [new TripWriteError('CONFLICT'), 409, 'IDEMPOTENCY_CONFLICT'],
    [new TripWriteError('NOT_FOUND'), 404, 'NOT_FOUND'],
    // Removed from the trip between authorization and commit: same answer as any outsider.
    [new TripWriteError('FORBIDDEN'), 404, 'NOT_FOUND'],
    [new RetiredBlobError(), 409, 'CONFLICT'],
  ])('maps %s to %s %s without writing', async (error, httpStatus, code) => {
    const result = await failing(error);
    expect(result.status).toBe(httpStatus);
    expect(result.body.error.code).toBe(code);
    expect(result.body.requestId).toEqual(expect.any(String));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('tells the client to wait when the transaction was aborted by contention', async () => {
    const aborted = Object.assign(new Error('write conflict'), {
      hasErrorLabel: (label: string) => label === 'TransientTransactionError',
    });
    const result = await failing(aborted);
    expect(result.status).toBe(429);
    expect(result.retryAfter).toBe('1');
    expect(result.body.error.code).toBe('BUSY');
  });

  it('recognises the label on a real driver error', async () => {
    const aborted = new mongo.MongoServerError({
      message: 'WriteConflict',
      errorLabels: ['TransientTransactionError'],
    });
    expect((await failing(aborted)).status).toBe(429);
    const unlabelled = new mongo.MongoServerError({ message: 'WriteConflict' });
    expect((await failing(unlabelled)).status).toBe(500);
  });

  it('reports every other failure as an unknown outcome (5xx) without leaking details', async () => {
    const unknown = Object.assign(new Error('connection 10.0.0.5 reset'), {
      hasErrorLabel: (label: string) => label === 'UnknownTransactionCommitResult',
    });
    for (const error of [unknown, new Error('boom'), 'string failure', null]) {
      vi.mocked(logger.error).mockClear();
      const result = await failing(error);
      expect(result.status).toBe(500);
      expect(result.body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(result.body)).not.toContain('10.0.0.5');
      // The cause goes to the server log, never to the client.
      expect(logger.error).toHaveBeenCalledWith('Create expense error', error);
    }
  });

  it('keeps ApiError instances untouched', () => {
    const error = new ApiError(418, 'TEAPOT', 5);
    expect(toExpenseWriteError(error)).toBe(error);
  });
});

describe('expense request lookup', () => {
  it('reports a committed result as the mobile detail and nothing else', async () => {
    mocks.receipt.mockResolvedValueOnce(webDto());
    const result = await mobileExpenseRequest(AMY, TRIP, KEY);
    expect(result).toEqual({
      status: 'committed',
      expense: expect.objectContaining({ id: '507f1f77bcf86cd799439099', payerId: AMY }),
    });
    expect(JSON.stringify(result)).not.toMatch(/login-|receipts\/|secret-tag/);
    expect(mocks.receipt).toHaveBeenCalledWith(undefined, {
      tripId: TRIP,
      actorId: AMY,
      clientRequestId: KEY,
    });
  });

  it('reports not_found when no result is stored for the caller', async () => {
    expect(await mobileExpenseRequest(AMY, TRIP, KEY)).toEqual({ status: 'not_found' });
  });

  it('authorizes first and rejects malformed keys without reading', async () => {
    mocks.membership.mockResolvedValueOnce(null);
    await expect(mobileExpenseRequest(OUTSIDER, TRIP, KEY)).rejects.toMatchObject({ status: 404 });
    await expect(mobileExpenseRequest(AMY, TRIP, 'nope')).rejects.toMatchObject({ status: 400 });
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
});
