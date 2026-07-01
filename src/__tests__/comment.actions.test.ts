import { describe, it, expect, vi, beforeEach } from 'vitest';

// comment.actions 不需真實 DB：mock session、membership、notify 與 Comment/Expense/User model。
const getSession = vi.fn();
const getTripMembership = vi.fn();
const notify = vi.fn();
const expenseFindOne = vi.fn();
const commentFind = vi.fn();
const commentFindOne = vi.fn();
const commentCreate = vi.fn();
const commentDeleteOne = vi.fn();
const commentAggregate = vi.fn();
const userFindById = vi.fn();

vi.mock('@/lib/auth', () => ({
  getSession: () => getSession(),
}));

vi.mock('@/lib/permissions', () => ({
  getTripMembership: (...args: unknown[]) => getTripMembership(...args),
}));

vi.mock('@/lib/notify', () => ({
  notify: (...args: unknown[]) => notify(...args),
}));

vi.mock('@/models', () => ({
  Comment: {
    find: (...args: unknown[]) => commentFind(...args),
    findOne: (...args: unknown[]) => commentFindOne(...args),
    create: (...args: unknown[]) => commentCreate(...args),
    deleteOne: (...args: unknown[]) => commentDeleteOne(...args),
    aggregate: (...args: unknown[]) => commentAggregate(...args),
  },
  Expense: {
    findOne: (...args: unknown[]) => expenseFindOne(...args),
  },
  User: {
    findById: (...args: unknown[]) => userFindById(...args),
  },
}));

import {
  getComments,
  getCommentCounts,
  createComment,
  deleteComment,
} from '@/actions/comment.actions';

// getCommentCounts casts tripId through mongoose's real Types.ObjectId (not
// mocked), so ids here must be valid 24-char hex strings, unlike the looser
// 'trip-1' style ids used elsewhere (e.g. trip-archive.test.ts).
const VIEWER = '507f191e810c19729de860ea';
const OTHER = '507f191e810c19729de860eb';
const TRIP_ID = '507f1f77bcf86cd799439011';
const EXPENSE_ID = '507f1f77bcf86cd799439012';
const COMMENT_ID = '507f1f77bcf86cd799439013';

/** Mongoose 的 findOne(...).select(...).lean() 鏈式呼叫。 */
function chainSelectLean(returnValue: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(returnValue) }) };
}

/** Mongoose 的 find(...).sort(...).lean() 鏈式呼叫。 */
function chainSortLean(returnValue: unknown) {
  return { sort: () => ({ lean: () => Promise.resolve(returnValue) }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ userId: VIEWER });
  getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'member' });
});

describe('getComments', () => {
  it('returns UNAUTHORIZED when there is no session', async () => {
    getSession.mockResolvedValue(null);

    const result = await getComments(TRIP_ID, EXPENSE_ID);

    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' });
    expect(expenseFindOne).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the user is not a member', async () => {
    getTripMembership.mockResolvedValue(null);

    const result = await getComments(TRIP_ID, EXPENSE_ID);

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
  });

  it('returns NOT_FOUND when the expense does not belong to this trip', async () => {
    expenseFindOne.mockReturnValue(chainSelectLean(null));

    const result = await getComments(TRIP_ID, EXPENSE_ID);

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(commentFind).not.toHaveBeenCalled();
  });

  it('returns the comment thread oldest to newest', async () => {
    expenseFindOne.mockReturnValue(chainSelectLean({ _id: EXPENSE_ID }));
    commentFind.mockReturnValue(
      chainSortLean([
        {
          _id: { toString: () => COMMENT_ID },
          expense: { toString: () => EXPENSE_ID },
          author: { toString: () => VIEWER },
          authorName: 'Alice',
          body: 'Great expense!',
          createdAt: new Date('2026-06-17T10:00:00.000Z'),
        },
      ])
    );

    const result = await getComments(TRIP_ID, EXPENSE_ID);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data).toEqual([
      {
        id: COMMENT_ID,
        expense_id: EXPENSE_ID,
        author_id: VIEWER,
        author_name: 'Alice',
        body: 'Great expense!',
        created_at: '2026-06-17T10:00:00.000Z',
      },
    ]);
  });
});

describe('getCommentCounts', () => {
  it('returns NOT_FOUND when the user is not a member', async () => {
    getTripMembership.mockResolvedValue(null);

    const result = await getCommentCounts(TRIP_ID);

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(commentAggregate).not.toHaveBeenCalled();
  });

  it('maps the aggregate rows to { expenseId: count }', async () => {
    commentAggregate.mockResolvedValue([{ _id: { toString: () => EXPENSE_ID }, count: 3 }]);

    const result = await getCommentCounts(TRIP_ID);

    expect(result).toEqual({ success: true, data: { [EXPENSE_ID]: 3 } });
  });
});

describe('createComment', () => {
  it('returns UNAUTHORIZED when there is no session', async () => {
    getSession.mockResolvedValue(null);

    const result = await createComment(TRIP_ID, EXPENSE_ID, { body: 'hi' });

    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' });
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the expense does not belong to this trip', async () => {
    expenseFindOne.mockReturnValue(chainSelectLean(null));

    const result = await createComment(TRIP_ID, EXPENSE_ID, { body: 'hi' });

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_ERROR for an empty body and never calls create', async () => {
    expenseFindOne.mockReturnValue(chainSelectLean({ description: 'Dinner' }));

    const result = await createComment(TRIP_ID, EXPENSE_ID, { body: '   ' });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it('creates the comment with a denormalized author name and notifies other members', async () => {
    expenseFindOne.mockReturnValue(chainSelectLean({ description: 'Dinner' }));
    userFindById.mockReturnValue(chainSelectLean({ displayName: 'Alice' }));
    commentCreate.mockResolvedValue({
      _id: { toString: () => COMMENT_ID },
      toObject: () => ({
        _id: { toString: () => COMMENT_ID },
        expense: { toString: () => EXPENSE_ID },
        author: { toString: () => VIEWER },
        authorName: 'Alice',
        body: 'Great expense!',
        createdAt: new Date('2026-06-17T10:00:00.000Z'),
      }),
    });

    const result = await createComment(TRIP_ID, EXPENSE_ID, { body: 'Great expense!' });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.author_name).toBe('Alice');
    expect(result.data.body).toBe('Great expense!');

    expect(commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        trip: TRIP_ID,
        expense: EXPENSE_ID,
        author: VIEWER,
        authorName: 'Alice',
        body: 'Great expense!',
      })
    );

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: TRIP_ID,
        actorId: VIEWER,
        type: 'expense_comment_added',
        meta: expect.objectContaining({ expense_id: EXPENSE_ID, comment_id: COMMENT_ID }),
      })
    );
  });
});

describe('deleteComment', () => {
  it('returns NOT_FOUND when the comment does not exist', async () => {
    commentFindOne.mockReturnValue(chainSelectLean(null));

    const result = await deleteComment(TRIP_ID, EXPENSE_ID, COMMENT_ID);

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(commentDeleteOne).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when a non-author, non-admin member tries to delete', async () => {
    getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'member' });
    commentFindOne.mockReturnValue(chainSelectLean({ author: { toString: () => OTHER } }));

    const result = await deleteComment(TRIP_ID, EXPENSE_ID, COMMENT_ID);

    expect(result).toEqual({ success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' });
    expect(commentDeleteOne).not.toHaveBeenCalled();
  });

  it('allows the author to delete their own comment', async () => {
    getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'member' });
    commentFindOne.mockReturnValue(chainSelectLean({ author: { toString: () => VIEWER } }));

    const result = await deleteComment(TRIP_ID, EXPENSE_ID, COMMENT_ID);

    expect(result.success).toBe(true);
    expect(commentDeleteOne).toHaveBeenCalledWith({ _id: COMMENT_ID });
  });

  it('allows a trip admin to delete someone else’s comment', async () => {
    getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'admin' });
    commentFindOne.mockReturnValue(chainSelectLean({ author: { toString: () => OTHER } }));

    const result = await deleteComment(TRIP_ID, EXPENSE_ID, COMMENT_ID);

    expect(result.success).toBe(true);
    expect(commentDeleteOne).toHaveBeenCalledWith({ _id: COMMENT_ID });
  });
});
