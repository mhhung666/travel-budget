import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';

// 獲取旅行成員列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { id } = await params;
    const tripId = parseInt(id);

    // 檢查用戶是否是此旅行的成員
    const { data: isMember } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', session.userId)
      .single();

    if (!isMember) {
      return NextResponse.json(
        { error: '您不是此旅行的成員' },
        { status: 403 }
      );
    }

    // 獲取所有成員
    const { data: members, error: membersError } = await supabase
      .from('trip_members')
      .select(`
        joined_at,
        users!inner (
          id,
          username,
          display_name
        )
      `)
      .eq('trip_id', tripId)
      .order('joined_at', { ascending: true });

    if (membersError) {
      throw membersError;
    }

    // 重新格式化資料以符合原本的結構
    const formattedMembers = members?.map((member: any) => {
      const user = Array.isArray(member.users) ? member.users[0] : member.users;
      return {
        id: user?.id,
        username: user?.username,
        display_name: user?.display_name,
        joined_at: member.joined_at,
      };
    }) || [];

    return NextResponse.json({ members: formattedMembers });
  } catch (error) {
    console.error('Get trip members error:', error);
    return NextResponse.json(
      { error: '獲取成員列表失敗' },
      { status: 500 }
    );
  }
}
