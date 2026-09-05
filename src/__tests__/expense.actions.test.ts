import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const getTripMembership = vi.fn();
const tripFindById = vi.fn();
const expenseCreate = vi.fn();
const expenseFindOne = vi.fn();
const expenseUpdateOne = vi.fn();
const expenseDeleteOne = vi.fn();
const expenseDistinct = vi.fn();
const itineraryCountDocuments = vi.fn();
const commentDeleteMany = vi.fn();
const headObject = vi.fn();
const deleteObjects = vi.fn();
const presignGet = vi.fn();
const notify = vi.fn();
const logActivity = vi.fn();
const revalidatePath = vi.fn();
const loggerError = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/permissions', () => ({
  getTripMembership: (...args: unknown[]) => getTripMembership(...args),
}));
vi.mock('@/lib/storage', () => ({
  headObject: (...args: unknown[]) => headObject(...args),
  deleteObjects: (...args: unknown[]) => deleteObjects(...args),
  presignGet: (...args: unknown[]) => presignGet(...args),
}));
vi.mock('@/lib/notify', () => ({ notify: (...args: unknown[]) => notify(...args) }));
vi.mock('@/lib/activity', () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));
vi.mock('@/lib/logger', () => ({
  logger: { error: (...args: unknown[]) => loggerError(...args) },
}));
vi.mock('@/lib/dto', () => ({
  toExpenseDto: (value: { _id?: { toString(): string } }, tripId: string) => ({
    id: value._id?.toString() ?? 'expense-1',
    trip_id: tripId,
  }),
}));
vi.mock('@/models', () => ({
  EXPENSE_CATEGORIES: [
    'accommodation',
    'transportation',
    'food',
    'shopping',
    'entertainment',
    'tickets',
    'other',
  ],
  Trip: { findById: (...args: unknown[]) => tripFindById(...args) },
  Expense: {
    create: (...args: unknown[]) => expenseCreate(...args),
    findOne: (...args: unknown[]) => expenseFindOne(...args),
    updateOne: (...args: unknown[]) => expenseUpdateOne(...args),
    deleteOne: (...args: unknown[]) => expenseDeleteOne(...args),
    distinct: (...args: unknown[]) => expenseDistinct(...args),
  },
  ItineraryDay: {
    countDocuments: (...args: unknown[]) => itineraryCountDocuments(...args),
  },
  Comment: { deleteMany: (...args: unknown[]) => commentDeleteMany(...args) },
}));

import {
  createExpense,
  deleteExpense,
  getExpenseTags,
  getReceiptUrl,
  updateExpense,
} from '@/actions/expense.actions';

const USER = '507f191e810c19729de860ea';
const MEMBER = '507f191e810c19729de860eb';
const OUTSIDER = '507f191e810c19729de860ec';
const TRIP = '507f1f77bcf86cd799439011';
const EXPENSE = '507f1f77bcf86cd799439012';
const DAY = '507f1f77bcf86cd799439013';
const RECEIPT = `receipts/${TRIP}/receipt.webp`;

const validInput = {
  payer_id: USER,
  original_amount: 100,
  currency: 'USD',
  exchange_rate: 30,
  description: 'Dinner',
  category: 'food',
  date: '2026-09-01',
  splits: [
    { user_id: USER, share_amount: 1500 },
    { user_id: MEMBER, share_amount: 1500 },
  ],
};

function selectLean(value: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

function currentExpense(overrides: Record<string, unknown> = {}) {
  return {
    originalAmount: 100,
    exchangeRate: 30,
    description: 'Dinner',
    splits: [
      { user: USER, shareAmount: 1500 },
      { user: MEMBER, shareAmount: 1500 },
    ],
    attachments: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ userId: USER });
  getTripMembership.mockResolvedValue({ tripId: TRIP, role: 'member' });
  tripFindById.mockReturnValue(
    selectLean({ name: 'Trip', hashCode: 'trip-code', members: [{ user: USER }, { user: MEMBER }] })
  );
  itineraryCountDocuments.mockResolvedValue(1);
  headObject.mockResolvedValue({ contentType: 'image/webp', size: 2048 });
  deleteObjects.mockResolvedValue(undefined);
  commentDeleteMany.mockResolvedValue(undefined);
  notify.mockResolvedValue(undefined);
  logActivity.mockResolvedValue(undefined);
  expenseUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  expenseDeleteOne.mockResolvedValue({ deletedCount: 1 });
  expenseDistinct.mockResolvedValue(['visa', '', 'food']);
});

describe('getExpenseTags', () => {
  it('loads only distinct non-empty tags after membership validation', async () => {
    expect(await getExpenseTags('oldcode1')).toEqual({
      success: true,
      data: ['food', 'visa'],
    });
    expect(expenseDistinct).toHaveBeenCalledWith('tags', { trip: TRIP });
  });
});

describe('createExpense', () => {
  it('rejects unauthenticated and non-member calls before reading trip data', async () => {
    getSession.mockResolvedValueOnce(null);
    expect(await createExpense(TRIP, validInput)).toEqual({
      success: false,
      error: 'UNAUTHORIZED',
      code: 'UNAUTHORIZED',
    });

    getTripMembership.mockResolvedValueOnce(null);
    expect(await createExpense(TRIP, validInput)).toEqual({
      success: false,
      error: 'NOT_FOUND',
      code: 'NOT_FOUND',
    });
    expect(expenseCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['payer', { ...validInput, payer_id: OUTSIDER }],
    ['split member', { ...validInput, splits: [{ user_id: OUTSIDER, share_amount: 3000 }] }],
    ['unbalanced shares', { ...validInput, splits: [{ user_id: USER, share_amount: 100 }] }],
  ])('rejects an invalid %s without creating an expense', async (_label, input) => {
    const result = await createExpense(TRIP, input);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(expenseCreate).not.toHaveBeenCalled();
  });

  it('rejects itinerary days from another trip', async () => {
    itineraryCountDocuments.mockResolvedValue(0);
    const result = await createExpense(TRIP, { ...validInput, itinerary_day_ids: [DAY] });
    expect(result.success).toBe(false);
    expect(itineraryCountDocuments).toHaveBeenCalledWith({ _id: { $in: [DAY] }, trip: TRIP });
    expect(expenseCreate).not.toHaveBeenCalled();
  });

  it('rejects cross-trip receipt keys without querying object storage', async () => {
    const result = await createExpense(TRIP, {
      ...validInput,
      attachments: [
        { key: 'receipts/another-trip/file.webp', content_type: 'image/webp', size: 1 },
      ],
    });
    expect(result.success).toBe(false);
    expect(headObject).not.toHaveBeenCalled();
    expect(expenseCreate).not.toHaveBeenCalled();
  });

  it('uses verified attachment metadata, deduplicates fields, and emits side effects', async () => {
    const created = {
      _id: { toString: () => EXPENSE },
      populate: vi.fn().mockResolvedValue(undefined),
      toObject: () => ({ _id: { toString: () => EXPENSE } }),
    };
    expenseCreate.mockResolvedValue(created);

    const result = await createExpense(TRIP, {
      ...validInput,
      attachments: [{ key: RECEIPT, content_type: 'image/png', size: 1 }],
      itinerary_day_ids: [DAY, DAY],
      tags: ['food', 'food'],
    });

    expect(result.success).toBe(true);
    expect(expenseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        trip: TRIP,
        amount: 3000,
        itineraryDays: [DAY],
        tags: ['food'],
        attachments: [
          expect.objectContaining({
            key: RECEIPT,
            contentType: 'image/webp',
            size: 2048,
            uploadedBy: USER,
          }),
        ],
      })
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: TRIP,
        actorId: USER,
        type: 'expense_added',
        tripSnapshot: { id: TRIP, name: 'Trip', hashCode: 'trip-code', memberIds: [USER, MEMBER] },
      })
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: TRIP, actorId: USER, type: 'expense_added' })
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP}/expenses`);
  });
});

describe('createExpense side-effect isolation', () => {
  beforeEach(() => {
    expenseCreate.mockResolvedValue({
      _id: { toString: () => EXPENSE },
      populate: vi.fn().mockResolvedValue(undefined),
      toObject: () => ({ _id: { toString: () => EXPENSE } }),
    });
  });

  it.each(['notification', 'activity', 'both'])(
    'preserves success when %s rejects',
    async (effect) => {
      if (effect !== 'activity')
        notify.mockRejectedValueOnce(new Error('notification unavailable'));
      if (effect !== 'notification')
        logActivity.mockRejectedValueOnce(new Error('activity unavailable'));
      expect((await createExpense(TRIP, validInput)).success).toBe(true);
      expect(expenseCreate).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(logActivity).toHaveBeenCalledTimes(1);
      expect(loggerError).toHaveBeenCalledTimes(effect === 'both' ? 2 : 1);
      expect(revalidatePath).toHaveBeenCalled();
    }
  );

  it('starts activity while notification is pending and awaits both', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    notify.mockReturnValueOnce(pending);
    let finished = false;
    const result = createExpense(TRIP, validInput).then((value) => {
      finished = true;
      return value;
    });
    try {
      await vi.waitFor(() => expect(logActivity).toHaveBeenCalledTimes(1));
      expect(finished).toBe(false);
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      release();
    }
    expect((await result).success).toBe(true);
  });
});

describe('updateExpense', () => {
  it('rejects a missing or cross-trip expense before updating', async () => {
    expenseFindOne.mockReturnValue(selectLean(null));
    expect(await updateExpense(TRIP, EXPENSE, { description: 'Updated' })).toEqual({
      success: false,
      error: 'NOT_FOUND',
      code: 'NOT_FOUND',
    });
    expect(expenseUpdateOne).not.toHaveBeenCalled();
  });

  it('rebalances existing participants when the amount changes without explicit splits', async () => {
    expenseFindOne.mockReturnValue(selectLean(currentExpense()));
    const result = await updateExpense(TRIP, EXPENSE, { original_amount: 200 });
    expect(result.success).toBe(true);
    expect(expenseUpdateOne).toHaveBeenCalledWith(
      { _id: EXPENSE, trip: TRIP },
      {
        $set: expect.objectContaining({
          originalAmount: 200,
          amount: 6000,
          splits: [
            { user: USER, shareAmount: 3000 },
            { user: MEMBER, shareAmount: 3000 },
          ],
        }),
      }
    );
  });

  it.each([
    ['payer', { payer_id: OUTSIDER }],
    ['split participant', { splits: [{ user_id: OUTSIDER, share_amount: 3000 }] }],
  ])('rejects an outside %s when updating an existing expense', async (_label, input) => {
    expenseFindOne.mockReturnValue(selectLean(currentExpense()));
    const result = await updateExpense(TRIP, EXPENSE, input);
    expect(result).toEqual({
      success: false,
      error: 'VALIDATION_ERROR',
      code: 'VALIDATION_ERROR',
    });
    expect(expenseUpdateOne).not.toHaveBeenCalled();
  });

  it('preserves existing attachment metadata and removes dropped blobs best-effort', async () => {
    const oldReceipt = `receipts/${TRIP}/old.webp`;
    const keptReceipt = `receipts/${TRIP}/kept.webp`;
    const kept = {
      key: keptReceipt,
      contentType: 'image/png',
      size: 500,
      uploadedBy: USER,
      uploadedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    expenseFindOne.mockReturnValue(
      selectLean(
        currentExpense({
          attachments: [kept, { ...kept, key: oldReceipt }],
        })
      )
    );
    deleteObjects.mockRejectedValueOnce(new Error('R2 unavailable'));

    const result = await updateExpense(TRIP, EXPENSE, {
      attachments: [{ key: keptReceipt, content_type: 'image/webp', size: 1 }],
    });

    expect(result.success).toBe(true);
    expect(headObject).not.toHaveBeenCalled();
    expect(deleteObjects).toHaveBeenCalledWith('receipts', [oldReceipt]);
    expect(loggerError).toHaveBeenCalledWith(
      'Update expense: receipt cleanup failed',
      expect.any(Error)
    );
    expect(expenseUpdateOne).toHaveBeenCalledWith(
      { _id: EXPENSE, trip: TRIP },
      { $set: { attachments: [kept] } }
    );
  });
});

describe('deleteExpense and getReceiptUrl', () => {
  it('cleans up receipt blobs and comments after a trip-scoped delete', async () => {
    expenseFindOne.mockReturnValue(
      selectLean({ attachments: [{ key: RECEIPT }], description: 'Dinner' })
    );
    const result = await deleteExpense(TRIP, EXPENSE);
    expect(result.success).toBe(true);
    expect(expenseDeleteOne).toHaveBeenCalledWith({ _id: EXPENSE, trip: TRIP });
    expect(deleteObjects).toHaveBeenCalledWith('receipts', [RECEIPT]);
    expect(commentDeleteMany).toHaveBeenCalledWith({ expense: EXPENSE });
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'expense_deleted', meta: { description: 'Dinner' } })
    );
  });

  it('never signs a receipt key outside the resolved trip', async () => {
    const result = await getReceiptUrl(TRIP, 'receipts/another-trip/file.webp');
    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(presignGet).not.toHaveBeenCalled();
  });

  it('signs an in-trip receipt for a member', async () => {
    presignGet.mockResolvedValue('https://signed.example/receipt');
    expect(await getReceiptUrl(TRIP, RECEIPT)).toEqual({
      success: true,
      data: { url: 'https://signed.example/receipt' },
    });
    expect(presignGet).toHaveBeenCalledWith('receipts', RECEIPT);
  });
});
