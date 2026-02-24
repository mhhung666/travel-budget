'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getTripMembership } from '@/lib/permissions';
import { addVirtualMemberSchema, type AddVirtualMemberInput } from '@/lib/validation';
import type { ActionResult } from './types';
import type { Member } from '@/types';

/**
 * Get all members for a trip
 */
export async function getMembers(tripIdOrCode: string): Promise<ActionResult<Member[]>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    // getTripId + requireMember 合併為一次查詢
    const membership = await getTripMembership(session.userId, tripIdOrCode);
    if (!membership) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    const { data: members, error: membersError } = await supabase
      .from('trip_members')
      .select(
        `
        joined_at,
        role,
        users!inner (
          id,
          username,
          display_name,
          is_virtual
        )
      `
      )
      .eq('trip_id', membership.tripId)
      .order('joined_at', { ascending: true });

    if (membersError) throw membersError;

    type TripMemberQuery = {
      joined_at: string;
      role: 'admin' | 'member' | null;
      users: {
        id: number;
        username: string;
        display_name: string;
        is_virtual: boolean | null;
      } | {
        id: number;
        username: string;
        display_name: string;
        is_virtual: boolean | null;
      }[];
    };

    const formattedMembers: Member[] =
      (members as unknown as TripMemberQuery[])?.map((member) => {
        const user = Array.isArray(member.users) ? member.users[0] : member.users;
        return {
          id: user?.id,
          username: user?.username,
          display_name: user?.display_name,
          is_virtual: user?.is_virtual || false,
          joined_at: member.joined_at,
          role: member.role || 'member',
        };
      }) || [];

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

    // getTripId + requireAdmin 合併為一次查詢
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

    // Create virtual user
    const virtualUsername = `virtual_${randomUUID()}`;
    const virtualPassword = randomUUID();
    const virtualEmail = `${virtualUsername}@virtual.local`;

    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([
        {
          username: virtualUsername,
          display_name: display_name.trim(),
          email: virtualEmail,
          password: virtualPassword,
          is_virtual: true,
        },
      ])
      .select()
      .single();

    if (userError) throw userError;

    // Add to trip
    const { data: memberData, error: memberError } = await supabase
      .from('trip_members')
      .insert([
        {
          trip_id: membership.tripId,
          user_id: newUser.id,
          role: 'member',
        },
      ])
      .select('joined_at')
      .single();

    if (memberError) {
      // Cleanup if failed
      await supabase.from('users').delete().eq('id', newUser.id);
      throw memberError;
    }

    const member: Member = {
      id: newUser.id,
      username: newUser.username,
      display_name: newUser.display_name,
      is_virtual: true,
      joined_at: memberData.joined_at,
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
  targetUserId: number,
  newRole: 'admin' | 'member'
): Promise<ActionResult<{ message: string }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    // getTripId + requireAdmin 合併為一次查詢
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

    // Update role — .select().single() 同時作為 existence check
    const { data: updated, error: updateError } = await supabase
      .from('trip_members')
      .update({ role: newRole })
      .eq('trip_id', membership.tripId)
      .eq('user_id', targetUserId)
      .select('role')
      .single();

    if (updateError || !updated) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    revalidatePath(`/trips/${tripIdOrCode}`);
    return {
      success: true,
      data: { message: '角色已更新' },
    };
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
  targetUserId: number
): Promise<ActionResult<{ message: string; warning?: string }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    // getTripId + requireAdmin 合併為一次查詢
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

    // 4 個獨立查詢並行執行，節省 3 個 round trip 的等待時間
    const [memberResult, expensesResult, splitsResult, userResult] = await Promise.all([
      supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', membership.tripId)
        .eq('user_id', targetUserId)
        .maybeSingle(),
      supabase
        .from('expenses')
        .select('id')
        .eq('trip_id', membership.tripId)
        .eq('payer_id', targetUserId)
        .limit(1),
      supabase
        .from('expense_splits')
        .select('expense_id')
        .eq('user_id', targetUserId)
        .limit(1),
      supabase
        .from('users')
        .select('is_virtual')
        .eq('id', targetUserId)
        .maybeSingle(),
    ]);

    if (!memberResult.data) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    const hasExpenses =
      (expensesResult.data && expensesResult.data.length > 0) ||
      (splitsResult.data && splitsResult.data.length > 0);
    const isVirtualMember = userResult.data?.is_virtual || false;

    // Remove member
    const { error: deleteError } = await supabase
      .from('trip_members')
      .delete()
      .eq('trip_id', membership.tripId)
      .eq('user_id', targetUserId);

    if (deleteError) throw deleteError;

    // Cleanup virtual member if no expenses
    if (isVirtualMember && !hasExpenses) {
      const { data: otherTrips } = await supabase
        .from('trip_members')
        .select('id')
        .eq('user_id', targetUserId)
        .limit(1);

      if (!otherTrips || otherTrips.length === 0) {
        await supabase.from('users').delete().eq('id', targetUserId);
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
