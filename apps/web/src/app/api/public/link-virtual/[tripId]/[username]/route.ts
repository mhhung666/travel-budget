import { NextResponse } from 'next/server';
import { Trip, User } from '@/models';
import { PublicApiError, apiError } from '@/lib/publicApiError';
import { withPublicTrip } from '@/lib/withPublicTrip';

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

export const GET = withPublicTrip<{ tripId: string; username: string }>(
  async ({ tripId, params: { username } }) => {
    const [trip, user] = await Promise.all([
      Trip.findById(tripId).select('name hashCode members').lean<LeanTrip>(),
      User.findOne({ username }).select('username displayName isVirtual').lean<LeanUser>(),
    ]);

    if (!trip) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }

    if (!user) {
      return apiError(PublicApiError.USER_NOT_FOUND, 404);
    }

    // Check if it's a virtual member
    if (!user.isVirtual) {
      return apiError(PublicApiError.NOT_VIRTUAL, 400);
    }

    // Check if this user is a member of this trip
    const isMember = trip.members.some((m) => m.user.toString() === user._id.toString());
    if (!isMember) {
      return apiError(PublicApiError.NOT_TRIP_MEMBER, 404);
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
  },
  { tripParam: 'tripId', logLabel: 'Link virtual member API error' }
);
