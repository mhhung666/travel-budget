import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getTripId } from '@/lib/permissions';

// 公開獲取旅行成員列表（不需登入）
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    // 獲取所有成員 (包含角色和虛擬成員標記)
    const { data: members, error: membersError } = await supabase
      .from('trip_members')
      .select(
        `
        joined_at,
        role,
        users!inner (
          id,
          username,
          display_name,
          is_virtual
        )
      `
      )
      .eq('trip_id', tripId)
      .order('joined_at', { ascending: true });

    if (membersError) {
      throw membersError;
    }

    // 重新格式化資料以符合原本的結構
    const formattedMembers =
      members?.map((member: any) => {
        const user = Array.isArray(member.users) ? member.users[0] : member.users;
        return {
          id: user?.id,
          username: user?.username,
          display_name: user?.display_name,
          is_virtual: user?.is_virtual || false,
          joined_at: member.joined_at,
          role: member.role,
        };
      }) || [];

    return NextResponse.json({ members: formattedMembers });
  } catch (error) {
    console.error('Get public trip members error:', error);
    return NextResponse.json({ error: '獲取成員列表失敗' }, { status: 500 });
  }
}
