import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getTripId } from '@/lib/permissions';

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

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json(
        { error: '旅行不存在' },
        { status: 404 }
      );
    }

    // 檢查用戶是否是此旅行的成員
    const { data: isMember, error: memberError } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', session.userId)
      .single();

    if (memberError || !isMember) {
      return NextResponse.json(
        { error: '您不是此旅行的成員' },
        { status: 403 }
      );
    }

    // 獲取所有成員 (包含角色)
    const { data: members, error: membersError } = await supabase
      .from('trip_members')
      .select(`
        joined_at,
        role,
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
        role: member.role,  // 新增角色欄位
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
