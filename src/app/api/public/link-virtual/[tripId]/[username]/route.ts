import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string; username: string }> }
) {
  try {
    const { tripId, username } = await params;

    // Get trip info (basic info only)
    // Try hash_code first, then numeric ID
    let trip = null;
    let tripError = null;

    // First try hash_code
    const hashResult = await supabase
      .from('trips')
      .select('id, name, hash_code')
      .eq('hash_code', tripId)
      .single();

    if (hashResult.data) {
      trip = hashResult.data;
    } else if (/^\d+$/.test(tripId)) {
      // If hash_code not found and tripId is numeric, try ID
      const idResult = await supabase
        .from('trips')
        .select('id, name, hash_code')
        .eq('id', parseInt(tripId, 10))
        .single();

      trip = idResult.data;
      tripError = idResult.error;
    } else {
      tripError = hashResult.error;
    }

    if (tripError || !trip) {
      return NextResponse.json(
        { error: 'Trip not found' },
        { status: 404 }
      );
    }

    // Get the user by username
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, display_name, is_virtual')
      .eq('username', username)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    // Check if it's a virtual member
    if (!user.is_virtual) {
      return NextResponse.json(
        { error: 'Member is not virtual' },
        { status: 400 }
      );
    }

    // Check if this user is a member of this trip
    const { data: memberData, error: memberError } = await supabase
      .from('trip_members')
      .select('joined_at, role')
      .eq('trip_id', trip.id)
      .eq('user_id', user.id)
      .single();

    if (memberError || !memberData) {
      return NextResponse.json(
        { error: 'Member not found in this trip' },
        { status: 404 }
      );
    }

    // Return limited info
    return NextResponse.json({
      trip: {
        id: trip.id,
        name: trip.name,
        hash_code: trip.hash_code,
      },
      member: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        is_virtual: user.is_virtual,
      },
    });
  } catch (error) {
    console.error('Link virtual member API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
