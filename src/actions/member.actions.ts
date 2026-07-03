'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/mongodb';
import { Trip, User, Expense, Payment, Checklist, Notification } from '@/models';
import { Friendship, friendshipPairKey } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import {
  addVirtualMemberSchema,
  addFriendsToTripSchema,
  type AddVirtualMemberInput,
  type AddFriendsToTripInput,
} from '@/lib/validation';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { Member } from '@/types';
import { logger } from '@/lib/logger';
import { notify } from '@/lib/notify';
import { logActivity } from '@/lib/activity';

type PopulatedMember = {
  user: {
    _id: { toString(): string };
    username: string;
    displayName: string;
    avatarUrl?: string | null;
    isVirtual?: boolean | null;
  } | null;
  role: 'admin' | 'member' | null;
  joinedAt: Date;
};

/**
 * Get all members for a trip
 */
export const getMembers = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<Member[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const trip = await Trip.findById(membership.tripId)
        .populate('members.user', 'username displayName isVirtual avatarUrl')
        .lean<{ members: PopulatedMember[] } | null>();

      if (!trip) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const formattedMembers: Member[] = trip.members
        .filter((m) => m.user)
        .map((m) => ({
          id: m.user!._id.toString(),
          username: m.user!.username,
          display_name: m.user!.displayName,
          avatar_url: m.user!.avatarUrl ?? null,
          is_virtual: m.user!.isVirtual || false,
          joined_at: m.joinedAt.toISOString(),
          role: m.role || 'member',
        }))
        .sort((a, b) => a.joined_at.localeCompare(b.joined_at));

      return { success: true, data: formattedMembers };
    } catch (error) {
      logger.error('Get trip members error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Add a virtual member (admin only)
 */
export const addVirtualMember = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: AddVirtualMemberInput
  ): Promise<ActionResult<Member>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      const validation = addVirtualMemberSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { display_name } = validation.data;

      await dbConnect();

      // Create virtual user
      const virtualUsername = `virtual_${randomUUID()}`;
      const newUser = await User.create({
        username: virtualUsername,
        displayName: display_name.trim(),
        email: `${virtualUsername}@virtual.local`,
        password: randomUUID(),
        isVirtual: true,
      });

      const joinedAt = new Date();
      try {
        await Trip.updateOne(
          { _id: membership.tripId },
          { $push: { members: { user: newUser._id, role: 'member', joinedAt } } }
        );
      } catch (memberError) {
        // Cleanup if adding to trip failed
        await User.deleteOne({ _id: newUser._id });
        throw memberError;
      }

      const member: Member = {
        id: newUser._id.toString(),
        username: newUser.username,
        display_name: newUser.displayName,
        is_virtual: true,
        joined_at: joinedAt.toISOString(),
        role: 'member',
      };

      revalidatePath(`/trips/${tripIdOrCode}`);
      return { success: true, data: member };
    } catch (error) {
      logger.error('Create virtual member error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 從好友一次挑選多人直接加入旅程（ROADMAP #12 Phase 3）。
 *
 * 權限：任何**成員**皆可（非僅管理員）——好友關係即代表對方同意，且分享邀請連結
 * 加入本就無審核，故「從好友加人」不比分享連結更寬。只允許加入**已成立好友**、
 * 且**尚非成員**者；虛擬成員本就不參與好友關係，自然被排除。
 */
export const addFriendsToTrip = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: AddFriendsToTripInput
  ): Promise<ActionResult<{ added: number }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = addFriendsToTripSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }
      // 去重 + 排除自己
      const requested = [...new Set(validation.data.friend_ids)].filter(
        (id) => id !== session.userId
      );
      if (requested.length === 0) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      await dbConnect();

      const tripId = membership.tripId;

      const trip = await Trip.findById(tripId)
        .select('members.user')
        .lean<{ members: { user: { toString(): string } }[] } | null>();
      if (!trip) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const memberIds = new Set(trip.members.map((m) => m.user.toString()));

      // 僅允許「已成立好友」：用排序 pair 鍵一次查回 accepted 關係，取出對方 id
      const pairKeys = requested.map((id) => friendshipPairKey(session.userId, id));
      const accepted = await Friendship.find({ pairKey: { $in: pairKeys }, status: 'accepted' })
        .select('requester recipient')
        .lean<{ requester: { toString(): string }; recipient: { toString(): string } }[]>();
      const acceptedFriendIds = new Set(
        accepted.map((f) => {
          const requester = f.requester.toString();
          return requester === session.userId ? f.recipient.toString() : requester;
        })
      );

      // 合格 = 已是好友 且 尚非本旅程成員
      const eligible = requested.filter((id) => acceptedFriendIds.has(id) && !memberIds.has(id));
      if (eligible.length === 0) {
        return { success: true, data: { added: 0 } };
      }

      // 逐一加入（filter 帶 members.user $ne 防併發重複加入），統計實際加入者
      const joinedAt = new Date();
      const added: string[] = [];
      for (const id of eligible) {
        const result = await Trip.updateOne(
          { _id: tripId, 'members.user': { $ne: id } },
          { $push: { members: { user: id, role: 'member', joinedAt } } }
        );
        if (result.modifiedCount > 0) added.push(id);
      }

      // 通知 + 動態牆：以「被加入者」為觸發者（語意＝他加入了旅程），fan-out 給既有成員；
      // 排除操作者本人（他有 toast 回饋，免自我通知）。notify 會再排除觸發者與虛擬成員。
      const recipientPool = [...new Set([...memberIds, ...added])].filter(
        (id) => id !== session.userId
      );
      await Promise.all(
        added.flatMap((id) => [
          notify({ tripId, actorId: id, type: 'member_joined', recipientIds: recipientPool }),
          logActivity({ tripId, actorId: id, type: 'member_joined' }),
        ])
      );

      revalidatePath(`/trips/${tripIdOrCode}`);
      return { success: true, data: { added: added.length } };
    } catch (error) {
      logger.error('Add friends to trip error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Update member role (admin only)
 */
export const updateMemberRole = withAuth(
  async (
    session,
    tripIdOrCode: string,
    targetUserId: string,
    newRole: 'admin' | 'member'
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      // Prevent admin from changing their own role
      if (session.userId === targetUserId) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const result = await Trip.updateOne(
        { _id: membership.tripId, 'members.user': targetUserId },
        { $set: { 'members.$.role': newRole } }
      );

      if (result.matchedCount === 0) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      revalidatePath(`/trips/${tripIdOrCode}`);
      return { success: true, data: { message: '角色已更新' } };
    } catch (error) {
      logger.error('Update member role error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Remove a member from trip (admin only)
 */
export const removeMember = withAuth(
  async (
    session,
    tripIdOrCode: string,
    targetUserId: string
  ): Promise<ActionResult<{ message: string; warning?: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      // Prevent admin from removing themselves
      if (session.userId === targetUserId) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const tripId = membership.tripId;

      // 並行：確認成員存在、是否有支出（付款人或分帳）或結算還款、是否虛擬成員
      const [trip, payerExpense, splitExpense, payment, user] = await Promise.all([
        Trip.findOne({ _id: tripId, 'members.user': targetUserId }).select('_id').lean(),
        Expense.exists({ trip: tripId, payer: targetUserId }),
        Expense.exists({ trip: tripId, 'splits.user': targetUserId }),
        Payment.exists({ trip: tripId, $or: [{ from: targetUserId }, { to: targetUserId }] }),
        User.findById(targetUserId)
          .select('isVirtual')
          .lean<{ isVirtual?: boolean | null } | null>(),
      ]);

      if (!trip) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      // 有任何財務紀錄（支出或還款）就保留 User，避免孤兒參照
      const hasExpenses = payerExpense !== null || splitExpense !== null || payment !== null;
      const isVirtualMember = user?.isVirtual || false;

      // Remove member from embedded array
      await Trip.updateOne({ _id: tripId }, { $pull: { members: { user: targetUserId } } });

      // 清掉清單項目對該成員的指派（指派不算財務紀錄、不阻擋移除，僅避免孤兒參照）
      await Checklist.updateMany(
        { trip: tripId, 'items.assignee': targetUserId },
        { $set: { 'items.$[el].assignee': null } },
        { arrayFilters: [{ 'el.assignee': targetUserId }] }
      );

      // 清掉此成員在本旅程的通知（已不是成員，通知點進去也無權檢視）
      await Notification.deleteMany({ trip: tripId, user: targetUserId });
      // 動態牆（ActivityLog）刻意**不清**：它是稽核性質的歷史紀錄，且 actorName 已去
      // 正規化（事件當下快照），即使該成員被移除，過往動態仍能正確顯示。

      // Cleanup virtual member if it has no expenses and belongs to no other trip
      if (isVirtualMember && !hasExpenses) {
        const otherTrip = await Trip.exists({ 'members.user': targetUserId });
        if (otherTrip === null) {
          await User.deleteOne({ _id: targetUserId });
        }
      }

      revalidatePath(`/trips/${tripIdOrCode}`);
      return {
        success: true,
        data: {
          message: '成員已移除',
          warning: hasExpenses ? '該成員的支出記錄已保留' : undefined,
        },
      };
    } catch (error) {
      logger.error('Remove member error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
