'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getTripId, requireAdmin } from '@/lib/permissions';
import { generateUniqueHashCode } from '@/lib/hashcode';
import {
  createTripSchema,
  updateTripSchema,
  type CreateTripInput,
  type UpdateTripInput,
} from '@/lib/validation';
import type { ActionResult } from './types';
import type { Trip, TripWithMembers } from '@/types';

/**
 * Get all trips for the current user
 */
export async function getTrips(): Promise<ActionResult<TripWithMembers[]>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const { data: tripMembers, error: tmError } = await supabase
      .from('trip_members')
      .select('trip_id')
      .eq('user_id', session.userId);

    if (tmError) throw tmError;

    const tripIds = tripMembers?.map((tm) => tm.trip_id) || [];

    if (tripIds.length === 0) {
      return { success: true, data: [] };
    }

    const { data: trips, error: tripsError } = await supabase
      .from('trips')
      .select(
        `
        id,
        name,
        description,
        start_date,
        end_date,
        location,
        created_at,
        hash_code,
        trip_members(count)
      `
      )
      .in('id', tripIds)
      .order('created_at', { ascending: false });

    if (tripsError) throw tripsError;

    const formattedTrips: TripWithMembers[] =
      trips?.map((trip) => ({
        id: trip.id,
        hash_code: trip.hash_code,
        name: trip.name,
        description: trip.description,
        start_date: trip.start_date,
        end_date: trip.end_date,
        location: trip.location,
        created_at: trip.created_at,
        member_count: (trip.trip_members as { count: number }[])?.[0]?.count || 0,
      })) || [];

    return { success: true, data: formattedTrips };
  } catch (error) {
    console.error('Get trips error:', error);
    return { success: false, error: '獲取旅行列表失敗', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Get a single trip by ID or hash code
 */
export async function getTrip(id: string): Promise<ActionResult<Trip>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(id);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    // Check membership
    const { data: isMember, error: memberError } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', session.userId)
      .single();

    if (memberError || !isMember) {
      return { success: false, error: '您不是此旅行的成員', code: 'FORBIDDEN' };
    }

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, name, description, start_date, end_date, location, created_at, hash_code')
      .eq('id', tripId)
      .single();

    if (tripError || !trip) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    return { success: true, data: trip };
  } catch (error) {
    console.error('Get trip error:', error);
    return { success: false, error: '獲取旅行詳情失敗', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Create a new trip
 */
export async function createTrip(input: CreateTripInput): Promise<ActionResult<Trip>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const validation = createTripSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      };
    }

    const { name, description, start_date, end_date, location } = validation.data;

    // Generate unique hash code
    const hashCode = await generateUniqueHashCode(async (code) => {
      const { data } = await supabase.from('trips').select('id').eq('hash_code', code).single();
      return data !== null;
    });

    // Create trip
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert([
        {
          name,
          description: description?.trim() || null,
          start_date: start_date || null,
          end_date: end_date || null,
          location: location || null,
          hash_code: hashCode,
        },
      ])
      .select()
      .single();

    if (tripError) throw tripError;

    // Add creator as admin
    const { error: memberError } = await supabase.from('trip_members').insert([
      {
        trip_id: trip.id,
        user_id: session.userId,
        role: 'admin',
      },
    ]);

    if (memberError) throw memberError;

    revalidatePath('/trips');
    return { success: true, data: trip };
  } catch (error) {
    console.error('Create trip error:', error);
    return { success: false, error: '創建旅行失敗', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Update a trip (admin only)
 */
export async function updateTrip(id: string, input: UpdateTripInput): Promise<ActionResult<Trip>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(id);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    // Check admin permission
    try {
      await requireAdmin(session.userId, tripId);
    } catch {
      return { success: false, error: '只有管理員可以編輯旅行', code: 'FORBIDDEN' };
    }

    const validation = updateTripSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      };
    }

    const { name, description, start_date, end_date, location } = validation.data;

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (start_date !== undefined) updateData.start_date = start_date || null;
    if (end_date !== undefined) updateData.end_date = end_date || null;
    if (location !== undefined) updateData.location = location || null;

    const { data: trip, error: updateError } = await supabase
      .from('trips')
      .update(updateData)
      .eq('id', tripId)
      .select('id, name, description, start_date, end_date, location, created_at, hash_code')
      .single();

    if (updateError) throw updateError;

    revalidatePath(`/trips/${id}`);
    return { success: true, data: trip };
  } catch (error) {
    console.error('Update trip error:', error);
    return { success: false, error: '更新旅行失敗', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Delete a trip (admin only)
 */
export async function deleteTrip(id: string): Promise<ActionResult<{ message: string }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(id);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    try {
      await requireAdmin(session.userId, tripId);
    } catch {
      return { success: false, error: '只有管理員可以刪除旅行', code: 'FORBIDDEN' };
    }

    const { error: deleteError } = await supabase.from('trips').delete().eq('id', tripId);

    if (deleteError) throw deleteError;

    revalidatePath('/trips');
    return { success: true, data: { message: '旅行已刪除' } };
  } catch (error) {
    console.error('Delete trip error:', error);
    return { success: false, error: '刪除旅行失敗', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Join a trip using trip ID or hash code
 */
export async function joinTrip(tripIdOrCode: string): Promise<ActionResult<Trip>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    if (!tripIdOrCode) {
      return { success: false, error: '請提供旅行 ID 或 hash code', code: 'VALIDATION_ERROR' };
    }

    const tripId = await getTripId(tripIdOrCode);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', session.userId)
      .single();

    if (existingMember) {
      return { success: false, error: '您已經是此旅行的成員', code: 'CONFLICT' };
    }

    // Join as member
    const { error: insertError } = await supabase.from('trip_members').insert({
      trip_id: tripId,
      user_id: session.userId,
      role: 'member',
    });

    if (insertError) throw insertError;

    const { data: trip } = await supabase
      .from('trips')
      .select('id, name, hash_code, description, start_date, end_date, location, created_at')
      .eq('id', tripId)
      .single();

    revalidatePath('/trips');
    return { success: true, data: trip! };
  } catch (error) {
    console.error('Join trip error:', error);
    return { success: false, error: '加入旅行失敗', code: 'INTERNAL_ERROR' };
  }
}
