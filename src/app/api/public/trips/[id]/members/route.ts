import { NextRequest, NextResponse } from 'next/server';
import { Trip } from '@/models';
import { getTripId } from '@/lib/permissions';

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
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // 支援 hash_code 或 ObjectId
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

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
  } catch (error) {
    console.error('Get public trip members error:', error);
    return NextResponse.json({ error: '獲取成員列表失敗' }, { status: 500 });
  }
}
