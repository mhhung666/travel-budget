import { describe, it, expect, vi, beforeEach } from 'vitest';

// friend.actions 不需真實 DB：mock session、dbConnect 與 Friendship/User model，
// 專注驗證好友狀態機（pending → accepted / 刪除）與授權邊界。
const getSession = vi.fn();
const friendshipFind = vi.fn();
const friendshipFindOne = vi.fn();
const friendshipCreate = vi.fn();
const friendshipUpdateOne = vi.fn();
const friendshipDeleteOne = vi.fn();
const userFindById = vi.fn();

vi.mock('@/lib/auth', () => ({
  getSession: () => getSession(),
}));

vi.mock('@/lib/mongodb', () => ({
  dbConnect: () => Promise.resolve(),
}));

vi.mock('@/models', () => ({
  Friendship: {
    find: (...args: unknown[]) => friendshipFind(...args),
    findOne: (...args: unknown[]) => friendshipFindOne(...args),
    create: (...args: unknown[]) => friendshipCreate(...args),
    updateOne: (...args: unknown[]) => friendshipUpdateOne(...args),
    deleteOne: (...args: unknown[]) => friendshipDeleteOne(...args),
  },
  User: {
    findById: (...args: unknown[]) => userFindById(...args),
  },
  // 與 src/models/Friendship.ts 相同的排序 pair 鍵實作
  friendshipPairKey: (a: string, b: string) => [a, b].sort().join(':'),
}));

import {
  getFriends,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from '@/actions/friend.actions';

// sendFriendRequest 用 mongoose 真實的 isValidObjectId 驗證輸入，
// 所以 id 必須是合法 24 字 hex 字串。
const ME = '507f191e810c19729de860ea';
const OTHER = '507f191e810c19729de860eb';
const FRIENDSHIP_ID = '507f1f77bcf86cd799439021';
const PAIR_KEY = [ME, OTHER].sort().join(':');

/** Mongoose 的 findById/findOne(...).select(...).lean() 鏈式呼叫。 */
function chainSelectLean(returnValue: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(returnValue) }) };
}

/** Mongoose 的 find(...).populate(...).populate(...).sort(...).lean() 鏈式呼叫。 */
function chainPopulateSortLean(returnValue: unknown) {
  const chain = {
    populate: () => chain,
    sort: () => ({ lean: () => Promise.resolve(returnValue) }),
  };
  return chain;
}

function friendshipRow(overrides: {
  id?: string;
  requester: unknown;
  recipient: unknown;
  status: 'pending' | 'accepted';
}) {
  return {
    _id: { toString: () => overrides.id ?? FRIENDSHIP_ID },
    requester: overrides.requester,
    recipient: overrides.recipient,
    status: overrides.status,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
  };
}

function userRef(id: string, name: string) {
  return {
    _id: { toString: () => id },
    username: name.toLowerCase(),
    displayName: name,
    avatarUrl: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ userId: ME });
});

describe('getFriends', () => {
  it('returns UNAUTHORIZED when there is no session', async () => {
    getSession.mockResolvedValue(null);

    const result = await getFriends();

    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' });
    expect(friendshipFind).not.toHaveBeenCalled();
  });

  it('splits rows into friends / incoming / outgoing from my perspective', async () => {
    friendshipFind.mockReturnValue(
      chainPopulateSortLean([
        // 已成立好友（我是 recipient）
        friendshipRow({
          id: 'f1',
          requester: userRef(OTHER, 'Alice'),
          recipient: userRef(ME, 'Me'),
          status: 'accepted',
        }),
        // 對方邀請我，待回覆
        friendshipRow({
          id: 'f2',
          requester: userRef(OTHER, 'Bob'),
          recipient: userRef(ME, 'Me'),
          status: 'pending',
        }),
        // 我送出的邀請
        friendshipRow({
          id: 'f3',
          requester: userRef(ME, 'Me'),
          recipient: userRef(OTHER, 'Carol'),
          status: 'pending',
        }),
      ])
    );

    const result = await getFriends();

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');

    expect(result.data.friends).toEqual([
      {
        id: 'f1',
        status: 'accepted',
        requested_by_me: false,
        user: { id: OTHER, username: 'alice', display_name: 'Alice', avatar_url: null },
        created_at: '2026-07-01T00:00:00.000Z',
      },
    ]);
    expect(result.data.incoming.map((f) => f.user.display_name)).toEqual(['Bob']);
    expect(result.data.incoming[0].requested_by_me).toBe(false);
    expect(result.data.outgoing.map((f) => f.user.display_name)).toEqual(['Carol']);
    expect(result.data.outgoing[0].requested_by_me).toBe(true);
  });

  it('skips rows whose counterpart user no longer exists (failed populate)', async () => {
    friendshipFind.mockReturnValue(
      chainPopulateSortLean([
        friendshipRow({ requester: null, recipient: userRef(ME, 'Me'), status: 'accepted' }),
      ])
    );

    const result = await getFriends();

    expect(result).toEqual({ success: true, data: { friends: [], incoming: [], outgoing: [] } });
  });
});

describe('sendFriendRequest', () => {
  it('returns UNAUTHORIZED when there is no session', async () => {
    getSession.mockResolvedValue(null);

    const result = await sendFriendRequest(OTHER);

    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' });
  });

  it('rejects inviting yourself', async () => {
    const result = await sendFriendRequest(ME);

    expect(result).toEqual({
      success: false,
      error: 'VALIDATION_ERROR',
      code: 'VALIDATION_ERROR',
    });
    expect(userFindById).not.toHaveBeenCalled();
  });

  it('rejects a malformed target id', async () => {
    const result = await sendFriendRequest('not-an-object-id');

    expect(result).toEqual({
      success: false,
      error: 'VALIDATION_ERROR',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns NOT_FOUND when the target user does not exist', async () => {
    userFindById.mockReturnValue(chainSelectLean(null));

    const result = await sendFriendRequest(OTHER);

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(friendshipCreate).not.toHaveBeenCalled();
  });

  it('rejects virtual members (they cannot participate in friendships)', async () => {
    userFindById.mockReturnValue(chainSelectLean({ isVirtual: true }));

    const result = await sendFriendRequest(OTHER);

    expect(result).toEqual({
      success: false,
      error: 'VALIDATION_ERROR',
      code: 'VALIDATION_ERROR',
    });
    expect(friendshipCreate).not.toHaveBeenCalled();
  });

  it('returns ALREADY_FRIENDS when the pair is already accepted', async () => {
    userFindById.mockReturnValue(chainSelectLean({ isVirtual: false }));
    friendshipFindOne.mockReturnValue(
      chainSelectLean({ status: 'accepted', requester: { toString: () => ME } })
    );

    const result = await sendFriendRequest(OTHER);

    expect(result).toEqual({ success: false, error: 'ALREADY_FRIENDS', code: 'CONFLICT' });
    expect(friendshipCreate).not.toHaveBeenCalled();
  });

  it('returns REQUEST_PENDING when my own invitation is still pending', async () => {
    userFindById.mockReturnValue(chainSelectLean({ isVirtual: false }));
    friendshipFindOne.mockReturnValue(
      chainSelectLean({ status: 'pending', requester: { toString: () => ME } })
    );

    const result = await sendFriendRequest(OTHER);

    expect(result).toEqual({ success: false, error: 'REQUEST_PENDING', code: 'CONFLICT' });
    expect(friendshipCreate).not.toHaveBeenCalled();
  });

  it('auto-accepts when the target already invited me (reverse pending)', async () => {
    userFindById.mockReturnValue(chainSelectLean({ isVirtual: false }));
    friendshipFindOne.mockReturnValue(
      chainSelectLean({ status: 'pending', requester: { toString: () => OTHER } })
    );
    friendshipUpdateOne.mockResolvedValue({ matchedCount: 1 });

    const result = await sendFriendRequest(OTHER);

    expect(result).toEqual({ success: true, data: { status: 'accepted' } });
    expect(friendshipUpdateOne).toHaveBeenCalledWith(
      { pairKey: PAIR_KEY, status: 'pending', recipient: ME },
      { $set: { status: 'accepted' } }
    );
    expect(friendshipCreate).not.toHaveBeenCalled();
  });

  it('creates a pending friendship when there is no existing relation', async () => {
    userFindById.mockReturnValue(chainSelectLean({ isVirtual: false }));
    friendshipFindOne.mockReturnValue(chainSelectLean(null));
    friendshipCreate.mockResolvedValue({});

    const result = await sendFriendRequest(OTHER);

    expect(result).toEqual({ success: true, data: { status: 'pending' } });
    expect(friendshipCreate).toHaveBeenCalledWith({ requester: ME, recipient: OTHER });
  });

  it('maps a duplicate-key race on create to REQUEST_PENDING', async () => {
    userFindById.mockReturnValue(chainSelectLean({ isVirtual: false }));
    friendshipFindOne.mockReturnValue(chainSelectLean(null));
    friendshipCreate.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));

    const result = await sendFriendRequest(OTHER);

    expect(result).toEqual({ success: false, error: 'REQUEST_PENDING', code: 'CONFLICT' });
  });
});

describe('acceptFriendRequest', () => {
  it('returns NOT_FOUND for a malformed id', async () => {
    const result = await acceptFriendRequest('nope');

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(friendshipUpdateOne).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when I am not the pending recipient', async () => {
    friendshipUpdateOne.mockResolvedValue({ matchedCount: 0 });

    const result = await acceptFriendRequest(FRIENDSHIP_ID);

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
  });

  it('atomically flips pending → accepted for the recipient', async () => {
    friendshipUpdateOne.mockResolvedValue({ matchedCount: 1 });

    const result = await acceptFriendRequest(FRIENDSHIP_ID);

    expect(result).toEqual({ success: true, data: { status: 'accepted' } });
    expect(friendshipUpdateOne).toHaveBeenCalledWith(
      { _id: FRIENDSHIP_ID, recipient: ME, status: 'pending' },
      { $set: { status: 'accepted' } }
    );
  });
});

describe('declineFriendRequest', () => {
  it('returns NOT_FOUND when no pending request involves me', async () => {
    friendshipDeleteOne.mockResolvedValue({ deletedCount: 0 });

    const result = await declineFriendRequest(FRIENDSHIP_ID);

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
  });

  it('deletes a pending request I am part of (decline or withdraw)', async () => {
    friendshipDeleteOne.mockResolvedValue({ deletedCount: 1 });

    const result = await declineFriendRequest(FRIENDSHIP_ID);

    expect(result).toEqual({ success: true, data: { deleted: true } });
    expect(friendshipDeleteOne).toHaveBeenCalledWith({
      _id: FRIENDSHIP_ID,
      status: 'pending',
      $or: [{ requester: ME }, { recipient: ME }],
    });
  });

  it('never deletes an accepted friendship (guarded by status filter)', async () => {
    friendshipDeleteOne.mockResolvedValue({ deletedCount: 0 });

    await declineFriendRequest(FRIENDSHIP_ID);

    expect(friendshipDeleteOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' })
    );
  });
});

describe('removeFriend', () => {
  it('returns NOT_FOUND when no accepted friendship involves me', async () => {
    friendshipDeleteOne.mockResolvedValue({ deletedCount: 0 });

    const result = await removeFriend(FRIENDSHIP_ID);

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
  });

  it('deletes an accepted friendship from either side', async () => {
    friendshipDeleteOne.mockResolvedValue({ deletedCount: 1 });

    const result = await removeFriend(FRIENDSHIP_ID);

    expect(result).toEqual({ success: true, data: { deleted: true } });
    expect(friendshipDeleteOne).toHaveBeenCalledWith({
      _id: FRIENDSHIP_ID,
      status: 'accepted',
      $or: [{ requester: ME }, { recipient: ME }],
    });
  });
});
