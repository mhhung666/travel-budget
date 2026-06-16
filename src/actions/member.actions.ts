'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/mongodb';
import { Trip, User, Expense } from '@/models';
import { getSession } from '@/lib/auth';
import { getTripMembership } from '@/lib/permissions';
import { addVirtualMemberSchema, type AddVirtualMemberInput } from '@/lib/validation';
import type { ActionResult } from './types';
import type { Member } from '@/types';

type PopulatedMember = {
  user: {
    _id: { toString(): string };
    username: string;
    displayName: string;
    isVirtual?: boolean | null;
  } | null;
  role: 'admin' | 'member' | null;
  joinedAt: Date;
};

/**
 * Get all members for a trip
 */
export async function getMembers(tripIdOrCode: string): Promise<ActionResult<Member[]>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    const membership = await getTripMembership(session.userId, tripIdOrCode);
    if (!membership) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    const trip = await Trip.findById(membership.tripId)
      .populate('members.user', 'username displayName isVirtual')
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
        is_virtual: m.user!.isVirtual || false,
        joined_at: m.joinedAt.toISOString(),
        role: m.role || 'member',
      }))
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at));

    return { success: true, data: formattedMembers };
  } catch (error) {
    console.error('Get trip members error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Add a virtual member (admin only)
 */
export async function addVirtualMember(
  tripIdOrCode: string,
  input: AddVirtualMemberInput
): Promise<ActionResult<Member>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

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
    console.error('Create virtual member error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Update member role (admin only)
 */
export async function updateMemberRole(
  tripIdOrCode: string,
  targetUserId: string,
  newRole: 'admin' | 'member'
): Promise<ActionResult<{ message: string }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

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
    console.error('Update member role error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Remove a member from trip (admin only)
 */
export async function removeMember(
  tripIdOrCode: string,
  targetUserId: string
): Promise<ActionResult<{ message: string; warning?: string }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

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

    // 並行：確認成員存在、是否有支出（付款人或分帳）、是否虛擬成員
    const [trip, payerExpense, splitExpense, user] = await Promise.all([
      Trip.findOne({ _id: tripId, 'members.user': targetUserId }).select('_id').lean(),
      Expense.exists({ trip: tripId, payer: targetUserId }),
      Expense.exists({ trip: tripId, 'splits.user': targetUserId }),
      User.findById(targetUserId).select('isVirtual').lean<{ isVirtual?: boolean | null } | null>(),
    ]);

    if (!trip) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    const hasExpenses = payerExpense !== null || splitExpense !== null;
    const isVirtualMember = user?.isVirtual || false;

    // Remove member from embedded array
    await Trip.updateOne({ _id: tripId }, { $pull: { members: { user: targetUserId } } });

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
    console.error('Remove member error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}
