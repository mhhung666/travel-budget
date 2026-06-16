import { NextRequest, NextResponse } from 'next/server';
import { Trip, User } from '@/models';
import { getTripIdByHashCode } from '@/lib/permissions';

type LeanTrip = {
  _id: { toString(): string };
  name: string;
  hashCode: string;
  members: { user: { toString(): string } }[];
};

type LeanUser = {
  _id: { toString(): string };
  username: string;
  displayName: string;
  isVirtual?: boolean | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string; username: string }> }
) {
  try {
    const { tripId, username } = await params;

    // 支援 hash_code 或 ObjectId
    const resolvedTripId = await getTripIdByHashCode(tripId);
    if (!resolvedTripId) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const [trip, user] = await Promise.all([
      Trip.findById(resolvedTripId).select('name hashCode members').lean<LeanTrip>(),
      User.findOne({ username }).select('username displayName isVirtual').lean<LeanUser>(),
    ]);

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    if (!user) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Check if it's a virtual member
    if (!user.isVirtual) {
      return NextResponse.json({ error: 'Member is not virtual' }, { status: 400 });
    }

    // Check if this user is a member of this trip
    const isMember = trip.members.some((m) => m.user.toString() === user._id.toString());
    if (!isMember) {
      return NextResponse.json({ error: 'Member not found in this trip' }, { status: 404 });
    }

    return NextResponse.json({
      trip: {
        id: trip._id.toString(),
        name: trip.name,
        hash_code: trip.hashCode,
      },
      member: {
        id: user._id.toString(),
        username: user.username,
        display_name: user.displayName,
        is_virtual: user.isVirtual,
      },
    });
  } catch (error) {
    console.error('Link virtual member API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
