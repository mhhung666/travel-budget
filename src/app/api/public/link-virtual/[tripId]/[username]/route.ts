import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string; username: string }> }
) {
  try {
    const { tripId, username } = await params;

    // Get trip info (basic info only)
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, name, hash_code')
      .or(`id.eq.${tripId},hash_code.eq.${tripId}`)
      .single();

    if (tripError || !trip) {
      return NextResponse.json(
        { error: 'Trip not found' },
        { status: 404 }
      );
    }

    // First get the user by display_name (since virtual members use display_name in URLs)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, display_name, is_virtual')
      .eq('display_name', username)
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
