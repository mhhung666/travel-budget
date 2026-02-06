import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getTripId } from '@/lib/permissions';

/**
 * Public API to get itinerary for a trip
 * Anyone can view the itinerary (no auth required)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tripId = await getTripId(id);

    if (!tripId) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const { data: itinerary, error } = await supabase
      .from('itinerary_days')
      .select('*')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ itinerary: itinerary || [] });
  } catch (error) {
    console.error('Get public itinerary error:', error);
    return NextResponse.json({ error: 'Failed to load itinerary' }, { status: 500 });
  }
}
