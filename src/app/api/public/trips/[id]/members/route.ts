import { NextResponse } from 'next/server';
import { Trip } from '@/models';
import { withPublicTrip } from '@/lib/withPublicTrip';

type PopulatedMember = {
  user: {
    _id: { toString(): string };
    username: string;
    displayName: string;
    isVirtual?: boolean | null;
  } | null;
  role: 'admin' | 'member' | null;
  joinedAt: Date;
};

// 公開獲取旅行成員列表（不需登入）
export const GET = withPublicTrip(
  async ({ tripId }) => {
    const trip = await Trip.findById(tripId)
      .populate('members.user', 'username displayName isVirtual')
      .select('members')
      .lean<{ members: PopulatedMember[] } | null>();

    const formattedMembers = (trip?.members || [])
      .filter((m) => m.user)
      .map((m) => ({
        id: m.user!._id.toString(),
        username: m.user!.username,
        display_name: m.user!.displayName,
        is_virtual: m.user!.isVirtual || false,
        joined_at: m.joinedAt.toISOString(),
        role: m.role,
      }))
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at));

    return NextResponse.json({ members: formattedMembers });
  },
  { logLabel: 'Get public trip members error' }
);
