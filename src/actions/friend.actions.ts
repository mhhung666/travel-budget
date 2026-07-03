'use server';

import { isValidObjectId } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { Friendship, friendshipPairKey, User } from '@/models';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { FriendItem, FriendsData, FriendshipStatus } from '@/types';
import { logger } from '@/lib/logger';

type PopulatedFriendUser = {
  _id: { toString(): string };
  username: string;
  displayName: string;
  avatarUrl?: string | null;
} | null;

type PopulatedFriendship = {
  _id: { toString(): string };
  requester: PopulatedFriendUser;
  recipient: PopulatedFriendUser;
  status: FriendshipStatus;
  createdAt: Date;
};

/**
 * 好友系統（ROADMAP #12 Phase 1）：邀請 / 接受 / 拒絕（含收回）/ 刪除 / 列表。
 * 好友關係不掛在任何旅程之下，只驗 session、不走 getTripMembership，
 * 故每個 action 自行 `dbConnect()`。狀態機全部用「條件式原子更新 / 刪除」實作
 * （filter 同時帶 _id + 我方角色 + 當前狀態），不做讀改寫，避免併發競態。
 */

/**
 * 我的好友總覽：已成立好友 + 收到 / 送出的 pending 邀請。
 */
export const getFriends = withAuth(async (session): Promise<ActionResult<FriendsData>> => {
  try {
    await dbConnect();

    const rows = await Friendship.find({
      $or: [{ requester: session.userId }, { recipient: session.userId }],
    })
      .populate('requester', 'username displayName avatarUrl')
      .populate('recipient', 'username displayName avatarUrl')
      .sort({ createdAt: -1 })
      .lean<PopulatedFriendship[]>();

    const data: FriendsData = { friends: [], incoming: [], outgoing: [] };

    for (const row of rows) {
      // populate 失敗（對方帳號已不存在）就跳過，不讓整個列表壞掉
      if (!row.requester || !row.recipient) continue;

      const requestedByMe = row.requester._id.toString() === session.userId;
      const other = requestedByMe ? row.recipient : row.requester;

      const item: FriendItem = {
        id: row._id.toString(),
        status: row.status,
        requested_by_me: requestedByMe,
        user: {
          id: other._id.toString(),
          username: other.username,
          display_name: other.displayName,
          avatar_url: other.avatarUrl ?? null,
        },
        created_at: row.createdAt.toISOString(),
      };

      if (row.status === 'accepted') data.friends.push(item);
      else if (requestedByMe) data.outgoing.push(item);
      else data.incoming.push(item);
    }

    return { success: true, data };
  } catch (error) {
    logger.error('Get friends error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
});

/**
 * 發好友邀請。若對方早已邀請過我（反向 pending），直接原子接受，
 * 避免「互按加好友」卡成雙方都在等對方回覆。
 */
export const sendFriendRequest = withAuth(
  async (session, targetUserId: string): Promise<ActionResult<{ status: FriendshipStatus }>> => {
    try {
      if (!isValidObjectId(targetUserId) || targetUserId === session.userId) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      await dbConnect();

      const target = await User.findById(targetUserId)
        .select('isVirtual')
        .lean<{ isVirtual?: boolean | null } | null>();
      if (!target) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      // 虛擬成員無法登入，不參與好友關係
      if (target.isVirtual) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const pairKey = friendshipPairKey(session.userId, targetUserId);
      const existing = await Friendship.findOne({ pairKey })
        .select('status requester')
        .lean<{ status: FriendshipStatus; requester: { toString(): string } } | null>();

      if (existing) {
        if (existing.status === 'accepted') {
          return { success: false, error: 'ALREADY_FRIENDS', code: 'CONFLICT' };
        }
        if (existing.requester.toString() === session.userId) {
          return { success: false, error: 'REQUEST_PENDING', code: 'CONFLICT' };
        }
        // 對方已先邀請我 → 視為接受
        await Friendship.updateOne(
          { pairKey, status: 'pending', recipient: session.userId },
          { $set: { status: 'accepted' } }
        );
        return { success: true, data: { status: 'accepted' } };
      }

      try {
        await Friendship.create({ requester: session.userId, recipient: targetUserId });
      } catch (createError) {
        // unique index 撞鍵（併發重複邀請）→ 視為已有邀請
        if ((createError as { code?: number }).code === 11000) {
          return { success: false, error: 'REQUEST_PENDING', code: 'CONFLICT' };
        }
        throw createError;
      }

      return { success: true, data: { status: 'pending' } };
    } catch (error) {
      logger.error('Send friend request error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 接受好友邀請（只有 pending 的 recipient 能接受）。
 */
export const acceptFriendRequest = withAuth(
  async (session, friendshipId: string): Promise<ActionResult<{ status: FriendshipStatus }>> => {
    try {
      if (!isValidObjectId(friendshipId)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      await dbConnect();

      const result = await Friendship.updateOne(
        { _id: friendshipId, recipient: session.userId, status: 'pending' },
        { $set: { status: 'accepted' } }
      );
      if (result.matchedCount === 0) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      return { success: true, data: { status: 'accepted' } };
    } catch (error) {
      logger.error('Accept friend request error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 拒絕（recipient）或收回（requester）pending 邀請 → 直接刪除文件。
 */
export const declineFriendRequest = withAuth(
  async (session, friendshipId: string): Promise<ActionResult<{ deleted: true }>> => {
    try {
      if (!isValidObjectId(friendshipId)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      await dbConnect();

      const result = await Friendship.deleteOne({
        _id: friendshipId,
        status: 'pending',
        $or: [{ requester: session.userId }, { recipient: session.userId }],
      });
      if (result.deletedCount === 0) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      return { success: true, data: { deleted: true } };
    } catch (error) {
      logger.error('Decline friend request error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 刪除好友（任一方都可刪除 accepted 關係）。
 */
export const removeFriend = withAuth(
  async (session, friendshipId: string): Promise<ActionResult<{ deleted: true }>> => {
    try {
      if (!isValidObjectId(friendshipId)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      await dbConnect();

      const result = await Friendship.deleteOne({
        _id: friendshipId,
        status: 'accepted',
        $or: [{ requester: session.userId }, { recipient: session.userId }],
      });
      if (result.deletedCount === 0) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      return { success: true, data: { deleted: true } };
    } catch (error) {
      logger.error('Remove friend error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
