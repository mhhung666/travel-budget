'use server';

import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getTripId, requireMember, requireAdmin } from '@/lib/permissions';
import {
  createItineraryDaySchema,
  updateItineraryDaySchema,
} from '@/lib/validation';
import type { ActionResult } from './types';
import type { ItineraryDay } from '@/types';

/**
 * Get all itinerary days for a trip
 */
export async function getItinerary(tripIdOrCode: string): Promise<ActionResult<ItineraryDay[]>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(tripIdOrCode);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    try {
      await requireMember(session.userId, tripId);
    } catch {
      return { success: false, error: '您不是此旅行的成員', code: 'FORBIDDEN' };
    }

    const { data, error } = await supabase
      .from('itinerary_days')
      .select('*')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true });

    if (error) throw error;

    return { success: true, data: (data || []) as ItineraryDay[] };
  } catch (error) {
    console.error('Get itinerary error:', error);
    return { success: false, error: '獲取行程規劃失敗', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Create a new itinerary day
 */
export async function createItineraryDay(
  tripIdOrCode: string,
  input: { title: string; content?: string }
): Promise<ActionResult<ItineraryDay>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(tripIdOrCode);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    try {
      await requireAdmin(session.userId, tripId);
    } catch {
      return { success: false, error: '需要管理員權限', code: 'FORBIDDEN' };
    }

    const validated = createItineraryDaySchema.parse(input);

    // Get next day_number
    const { data: maxData } = await supabase
      .from('itinerary_days')
      .select('day_number')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: false })
      .limit(1);

    const nextDayNumber = (maxData && maxData.length > 0) ? maxData[0].day_number + 1 : 1;

    const { data, error } = await supabase
      .from('itinerary_days')
      .insert({
        trip_id: tripId,
        day_number: nextDayNumber,
        title: validated.title,
        content: validated.content || '',
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, data: data as ItineraryDay };
  } catch (error) {
    console.error('Create itinerary day error:', error);
    return { success: false, error: '新增行程失敗', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Update an itinerary day
 */
export async function updateItineraryDay(
  tripIdOrCode: string,
  dayId: number,
  input: { title?: string; content?: string; day_number?: number }
): Promise<ActionResult<ItineraryDay>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(tripIdOrCode);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    try {
      await requireAdmin(session.userId, tripId);
    } catch {
      return { success: false, error: '需要管理員權限', code: 'FORBIDDEN' };
    }

    const validated = updateItineraryDaySchema.parse(input);

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.content !== undefined) updateData.content = validated.content;
    if (validated.day_number !== undefined) updateData.day_number = validated.day_number;

    const { data, error } = await supabase
      .from('itinerary_days')
      .update(updateData)
      .eq('id', dayId)
      .eq('trip_id', tripId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, data: data as ItineraryDay };
  } catch (error) {
    console.error('Update itinerary day error:', error);
    return { success: false, error: '更新行程失敗', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Delete an itinerary day and renumber remaining days
 */
export async function deleteItineraryDay(
  tripIdOrCode: string,
  dayId: number
): Promise<ActionResult<{ message: string }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(tripIdOrCode);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    try {
      await requireAdmin(session.userId, tripId);
    } catch {
      return { success: false, error: '需要管理員權限', code: 'FORBIDDEN' };
    }

    // Get the day being deleted
    const { data: dayToDelete } = await supabase
      .from('itinerary_days')
      .select('day_number')
      .eq('id', dayId)
      .eq('trip_id', tripId)
      .single();

    if (!dayToDelete) {
      return { success: false, error: '行程不存在', code: 'NOT_FOUND' };
    }

    // Delete the day
    const { error } = await supabase
      .from('itinerary_days')
      .delete()
      .eq('id', dayId)
      .eq('trip_id', tripId);

    if (error) throw error;

    // Renumber remaining days
    const { data: remaining } = await supabase
      .from('itinerary_days')
      .select('id, day_number')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true });

    if (remaining) {
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].day_number !== i + 1) {
          await supabase
            .from('itinerary_days')
            .update({ day_number: i + 1 })
            .eq('id', remaining[i].id);
        }
      }
    }

    return { success: true, data: { message: '行程已刪除' } };
  } catch (error) {
    console.error('Delete itinerary day error:', error);
    return { success: false, error: '刪除行程失敗', code: 'INTERNAL_ERROR' };
  }
}
