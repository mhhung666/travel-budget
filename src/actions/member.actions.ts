'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getTripId, requireAdmin, requireMember } from '@/lib/permissions';
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
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(tripIdOrCode);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    // Check membership
    try {
      await requireMember(session.userId, tripId);
    } catch {
      return { success: false, error: '您不是此旅行的成員', code: 'FORBIDDEN' };
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
      .eq('trip_id', tripId)
      .order('joined_at', { ascending: true });

    if (membersError) throw membersError;

    const formattedMembers: Member[] =
      members?.map((member: any) => {
        const user = Array.isArray(member.users) ? member.users[0] : member.users;
        return {
          id: user?.id,
          username: user?.username,
          display_name: user?.display_name,
          is_virtual: user?.is_virtual || false,
          joined_at: member.joined_at,
          role: member.role,
        };
      }) || [];

    return { success: true, data: formattedMembers };
  } catch (error) {
    console.error('Get trip members error:', error);
    return { success: false, error: '獲取成員列表失敗', code: 'INTERNAL_ERROR' };
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
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(tripIdOrCode);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    // Check admin permission
    try {
      await requireAdmin(session.userId, tripId);
    } catch {
      return { success: false, error: '只有管理員可以新增虛擬成員', code: 'FORBIDDEN' };
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
          trip_id: tripId,
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
    return { success: false, error: '新增虛擬成員失敗', code: 'INTERNAL_ERROR' };
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
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(tripIdOrCode);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    // Check admin permission
    try {
      await requireAdmin(session.userId, tripId);
    } catch {
      return { success: false, error: '只有管理員可以移除成員', code: 'FORBIDDEN' };
    }

    // Prevent admin from removing themselves
    if (session.userId === targetUserId) {
      return { success: false, error: '管理員不能移除自己', code: 'VALIDATION_ERROR' };
    }

    // Check if target is a member
    const { data: memberCheck } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', targetUserId)
      .single();

    if (!memberCheck) {
      return { success: false, error: '該用戶不是此旅行的成員', code: 'NOT_FOUND' };
    }

    // Check if member has expenses
    const { data: expenses } = await supabase
      .from('expenses')
      .select('id')
      .eq('trip_id', tripId)
      .eq('payer_id', targetUserId)
      .limit(1);

    const { data: splits } = await supabase
      .from('expense_splits')
      .select('expense_id')
      .eq('user_id', targetUserId)
      .limit(1);

    const hasExpenses = (expenses && expenses.length > 0) || (splits && splits.length > 0);

    // Check if virtual member
    const { data: targetUser } = await supabase
      .from('users')
      .select('is_virtual')
      .eq('id', targetUserId)
      .single();

    const isVirtualMember = targetUser?.is_virtual || false;

    // Remove member
    const { error: deleteError } = await supabase
      .from('trip_members')
      .delete()
      .eq('trip_id', tripId)
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
    return { success: false, error: '移除成員失敗', code: 'INTERNAL_ERROR' };
  }
}
