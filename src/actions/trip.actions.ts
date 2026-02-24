'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getTripMembership } from '@/lib/permissions';
import { generateUniqueHashCode } from '@/lib/hashcode';
import {
  createTripSchema,
  updateTripSchema,
  type CreateTripInput,
  type UpdateTripInput,
} from '@/lib/validation';
import type { ActionResult } from './types';
import type { Trip, TripWithMembers } from '@/types';
import type { Database } from '@/types/database.types';

/**
 * Get all trips for the current user
 */
export async function getTrips(): Promise<ActionResult<TripWithMembers[]>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
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
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Get a single trip by ID or hash code
 */
export async function getTrip(id: string): Promise<ActionResult<Trip>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    // getTripId + membership check 合併為一次查詢
    const membership = await getTripMembership(session.userId, id);
    if (!membership) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, name, description, start_date, end_date, location, created_at, hash_code')
      .eq('id', membership.tripId)
      .single();

    if (tripError || !trip) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    return { success: true, data: trip };
  } catch (error) {
    console.error('Get trip error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Get trip preview info for join page (no membership required)
 * Returns basic trip info + member count + whether current user is already a member
 */
export async function getTripPreview(
  hashCode: string
): Promise<ActionResult<TripWithMembers & { isMember: boolean }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    const { data: tripRow, error: tripError } = await supabase
      .from('trips')
      .select('id, name, description, start_date, end_date, location, created_at, hash_code')
      .eq('hash_code', hashCode)
      .single();

    if (tripError || !tripRow) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    // Run member count + membership check in parallel
    const [{ count }, { data: membership }] = await Promise.all([
      supabase
        .from('trip_members')
        .select('id', { count: 'exact', head: true })
        .eq('trip_id', tripRow.id),
      supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', tripRow.id)
        .eq('user_id', session.userId)
        .single(),
    ]);

    return {
      success: true,
      data: {
        ...tripRow,
        member_count: count ?? 0,
        isMember: !!membership,
      } as TripWithMembers & { isMember: boolean },
    };
  } catch (error) {
    console.error('Get trip preview error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Create a new trip
 */
export async function createTrip(input: CreateTripInput): Promise<ActionResult<Trip>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
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
          location: (location || null) as any,
          hash_code: hashCode,
        },
      ] satisfies Database['public']['Tables']['trips']['Insert'][])
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
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Update a trip (admin only)
 */
export async function updateTrip(id: string, input: UpdateTripInput): Promise<ActionResult<Trip>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    // getTripId + requireAdmin 合併為一次查詢
    const membership = await getTripMembership(session.userId, id);
    if (!membership) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }
    if (membership.role !== 'admin') {
      return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
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

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (start_date !== undefined) updateData.start_date = start_date || null;
    if (end_date !== undefined) updateData.end_date = end_date || null;
    if (location !== undefined) updateData.location = location || null;

    const { data: trip, error: updateError } = await supabase
      .from('trips')
      .update(updateData)
      .eq('id', membership.tripId)
      .select('id, name, description, start_date, end_date, location, created_at, hash_code')
      .single();

    if (updateError) throw updateError;

    revalidatePath(`/trips/${id}`);
    return { success: true, data: trip };
  } catch (error) {
    console.error('Update trip error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Delete a trip (admin only)
 */
export async function deleteTrip(id: string): Promise<ActionResult<{ message: string }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    // getTripId + requireAdmin 合併為一次查詢
    const membership = await getTripMembership(session.userId, id);
    if (!membership) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }
    if (membership.role !== 'admin') {
      return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
    }

    const { error: deleteError } = await supabase.from('trips').delete().eq('id', membership.tripId);

    if (deleteError) throw deleteError;

    revalidatePath('/trips');
    return { success: true, data: { message: '旅行已刪除' } };
  } catch (error) {
    console.error('Delete trip error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Join a trip using trip ID or hash code
 */
export async function joinTrip(tripIdOrCode: string): Promise<ActionResult<Trip>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    if (!tripIdOrCode) {
      return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
    }

    const { data: tripRow, error: tripError } = await supabase
      .from('trips')
      .select('id, name, hash_code, description, start_date, end_date, location, created_at')
      .eq(/^\d+$/.test(tripIdOrCode) ? 'id' : 'hash_code', /^\d+$/.test(tripIdOrCode) ? parseInt(tripIdOrCode, 10) : tripIdOrCode)
      .single();

    if (tripError || !tripRow) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripRow.id)
      .eq('user_id', session.userId)
      .single();

    if (existingMember) {
      return { success: false, error: 'CONFLICT', code: 'CONFLICT' };
    }

    // Join as member
    const { error: insertError } = await supabase.from('trip_members').insert({
      trip_id: tripRow.id,
      user_id: session.userId,
      role: 'member',
    });

    if (insertError) throw insertError;

    revalidatePath('/trips');
    return { success: true, data: tripRow };
  } catch (error) {
    console.error('Join trip error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}
