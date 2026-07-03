import { describe, it, expect, vi, beforeEach } from 'vitest';

// member.actions（聚焦 addFriendsToTrip / ROADMAP #12 Phase 3）不需真實 DB：
// mock session、membership、Trip/Friendship model 與通知副作用。
const getSession = vi.fn();
const getTripMembership = vi.fn();
const tripFindById = vi.fn();
const tripUpdateOne = vi.fn();
const friendshipFind = vi.fn();
const notify = vi.fn();
const logActivity = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/auth', () => ({
  getSession: () => getSession(),
}));

vi.mock('@/lib/mongodb', () => ({
  dbConnect: () => Promise.resolve(),
}));

vi.mock('@/lib/permissions', () => ({
  getTripMembership: (...args: unknown[]) => getTripMembership(...args),
}));

vi.mock('@/lib/notify', () => ({
  notify: (...args: unknown[]) => notify(...args),
}));

vi.mock('@/lib/activity', () => ({
  logActivity: (...args: unknown[]) => logActivity(...args),
}));

vi.mock('@/models', () => ({
  Trip: {
    findById: (...args: unknown[]) => tripFindById(...args),
    updateOne: (...args: unknown[]) => tripUpdateOne(...args),
  },
  Friendship: {
    find: (...args: unknown[]) => friendshipFind(...args),
  },
  // 與 src/models/Friendship.ts 相同的排序 pair 鍵實作
  friendshipPairKey: (a: string, b: string) => [a, b].sort().join(':'),
  // 下列 model 只為 import 不報錯，addFriendsToTrip 不會用到
  User: {},
  Expense: {},
  Payment: {},
  Checklist: {},
  Notification: {},
}));

import { addFriendsToTrip } from '@/actions/member.actions';

// objectIdSchema 需 24 字 hex
const ME = '507f191e810c19729de860ea';
const F1 = '507f191e810c19729de860eb';
const F2 = '507f191e810c19729de860ec';
const EXISTING = '507f191e810c19729de860ed'; // 已是成員的好友
const STRANGER = '507f191e810c19729de860ee'; // 非好友
const TRIP_ID = '507f1f77bcf86cd799439021';

function chainSelectLean(returnValue: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(returnValue) }) };
}

/** Trip.findById 回傳的成員清單（embedded members.user）。 */
function tripWithMembers(userIds: string[]) {
  return chainSelectLean({ members: userIds.map((id) => ({ user: { toString: () => id } })) });
}

/** Friendship.find 回傳的 accepted 關係（requester 一律設為 ME，recipient 為對方）。 */
function acceptedFriendships(otherIds: string[]) {
  return chainSelectLean(
    otherIds.map((id) => ({
      requester: { toString: () => ME },
      recipient: { toString: () => id },
    }))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ userId: ME });
  getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'member' });
  tripUpdateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe('addFriendsToTrip', () => {
  it('returns UNAUTHORIZED when there is no session', async () => {
    getSession.mockResolvedValue(null);
    const result = await addFriendsToTrip(TRIP_ID, { friend_ids: [F1] });
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' });
  });

  it('returns NOT_FOUND when the caller is not a member', async () => {
    getTripMembership.mockResolvedValue(null);
    const result = await addFriendsToTrip(TRIP_ID, { friend_ids: [F1] });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
  });

  it('rejects an empty selection (schema min 1)', async () => {
    const result = await addFriendsToTrip(TRIP_ID, { friend_ids: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a malformed friend id', async () => {
    const result = await addFriendsToTrip(TRIP_ID, { friend_ids: ['not-an-id'] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('adds only accepted friends who are not already members, notifying per join', async () => {
    tripFindById.mockReturnValue(tripWithMembers([ME, EXISTING]));
    // F1、F2、EXISTING 都是好友，但 EXISTING 已是成員
    friendshipFind.mockReturnValue(acceptedFriendships([F1, F2, EXISTING]));

    const result = await addFriendsToTrip(TRIP_ID, { friend_ids: [F1, F2, EXISTING] });

    expect(result).toEqual({ success: true, data: { added: 2 } });
    // 只對 F1、F2 push（EXISTING 已是成員被排除）
    expect(tripUpdateOne).toHaveBeenCalledTimes(2);
    // 每位新成員各發一則 member_joined 通知 + 動態牆（觸發者＝被加入者）
    expect(notify).toHaveBeenCalledTimes(2);
    expect(logActivity).toHaveBeenCalledTimes(2);
    const notifiedActors = notify.mock.calls.map((c) => c[0].actorId).sort();
    expect(notifiedActors).toEqual([F1, F2].sort());
    // 通知類型正確、且排除操作者本人（recipientPool 不含 ME）
    expect(notify.mock.calls[0][0].type).toBe('member_joined');
    expect(notify.mock.calls[0][0].recipientIds).not.toContain(ME);
  });

  it('ignores ids that are not accepted friends', async () => {
    tripFindById.mockReturnValue(tripWithMembers([ME]));
    friendshipFind.mockReturnValue(acceptedFriendships([F1])); // STRANGER 非好友

    const result = await addFriendsToTrip(TRIP_ID, { friend_ids: [F1, STRANGER] });

    expect(result).toEqual({ success: true, data: { added: 1 } });
    expect(tripUpdateOne).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].actorId).toBe(F1);
  });

  it('returns added:0 without notifying when nothing is eligible', async () => {
    tripFindById.mockReturnValue(tripWithMembers([ME, EXISTING]));
    friendshipFind.mockReturnValue(acceptedFriendships([EXISTING])); // 好友但已是成員

    const result = await addFriendsToTrip(TRIP_ID, { friend_ids: [EXISTING] });

    expect(result).toEqual({ success: true, data: { added: 0 } });
    expect(tripUpdateOne).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('excludes the caller from their own selection', async () => {
    tripFindById.mockReturnValue(tripWithMembers([ME]));
    friendshipFind.mockReturnValue(acceptedFriendships([F1]));

    // 選單意外含自己 → 過濾掉，只加 F1
    const result = await addFriendsToTrip(TRIP_ID, { friend_ids: [ME, F1] });

    expect(result).toEqual({ success: true, data: { added: 1 } });
    expect(notify.mock.calls[0][0].actorId).toBe(F1);
  });
});
