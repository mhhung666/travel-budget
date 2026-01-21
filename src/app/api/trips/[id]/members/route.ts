import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getTripId, requireAdmin } from '@/lib/permissions';
import { randomUUID } from 'crypto';

// 獲取旅行成員列表
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { id } = await params;

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    // 檢查用戶是否是此旅行的成員
    const { data: isMember, error: memberError } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', session.userId)
      .single();

    if (memberError || !isMember) {
      return NextResponse.json({ error: '您不是此旅行的成員' }, { status: 403 });
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
    console.error('Get trip members error:', error);
    return NextResponse.json({ error: '獲取成員列表失敗' }, { status: 500 });
  }
}

// 新增虛擬成員 (僅管理員)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { id } = await params;

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    // 驗證管理員權限
    try {
      await requireAdmin(session.userId, tripId);
    } catch (error) {
      return NextResponse.json({ error: '只有管理員可以新增虛擬成員' }, { status: 403 });
    }

    const body = await request.json();
    const { display_name } = body;

    if (!display_name || display_name.trim().length === 0) {
      return NextResponse.json({ error: '請輸入成員名稱' }, { status: 400 });
    }

    // 建立虛擬用戶 (使用 UUID 作為 username，隨機密碼)
    const virtualUsername = `virtual_${randomUUID()}`;
    const virtualPassword = randomUUID(); // 虛擬用戶不會用到密碼

    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([
        {
          username: virtualUsername,
          display_name: display_name.trim(),
          password: virtualPassword,
          is_virtual: true,
        },
      ])
      .select()
      .single();

    if (userError) {
      console.error('Create virtual user error:', userError);
      throw userError;
    }

    // 將虛擬用戶加入旅行
    const { error: memberError } = await supabase.from('trip_members').insert([
      {
        trip_id: tripId,
        user_id: newUser.id,
        role: 'member',
      },
    ]);

    if (memberError) {
      // 如果加入失敗，刪除剛建立的用戶
      await supabase.from('users').delete().eq('id', newUser.id);
      throw memberError;
    }

    return NextResponse.json({
      message: '虛擬成員已新增',
      member: {
        id: newUser.id,
        username: newUser.username,
        display_name: newUser.display_name,
        is_virtual: true,
        role: 'member',
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Create virtual member error:', error);
    return NextResponse.json({ error: '新增虛擬成員失敗' }, { status: 500 });
  }
}
