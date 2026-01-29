import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';
import { getTripId } from '@/lib/permissions';
import { createSession } from '@/lib/auth';
import { registerSchema } from '@/lib/validation';

/**
 * 將虛擬成員轉換為正式會員（註冊）
 * POST /api/public/trips/[id]/convert-member
 * Body: { virtualUserId, username, display_name, email, password }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { virtualUserId, username, display_name, email, password } = body;

    // 驗證 trip 存在
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    // 驗證 virtualUserId
    if (!virtualUserId || typeof virtualUserId !== 'number') {
      return NextResponse.json({ error: '無效的虛擬成員 ID' }, { status: 400 });
    }

    // 驗證目標用戶是虛擬成員
    const { data: virtualUser, error: userError } = await supabase
      .from('users')
      .select('id, is_virtual')
      .eq('id', virtualUserId)
      .single();

    if (userError || !virtualUser) {
      return NextResponse.json({ error: '找不到此用戶' }, { status: 404 });
    }

    if (!virtualUser.is_virtual) {
      return NextResponse.json({ error: '此用戶不是虛擬成員' }, { status: 400 });
    }

    // 驗證該虛擬成員屬於此 trip
    const { data: memberCheck } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', virtualUserId)
      .single();

    if (!memberCheck) {
      return NextResponse.json({ error: '此虛擬成員不屬於此旅行' }, { status: 400 });
    }

    // 驗證註冊資料
    const validation = registerSchema.safeParse({ username, display_name, email, password });
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    // 檢查 username 唯一性（排除自身）
    const { data: existingUsername } = await supabase
      .from('users')
      .select('id')
      .ilike('username', username)
      .neq('id', virtualUserId)
      .single();

    if (existingUsername) {
      return NextResponse.json({ error: '用戶名已被使用' }, { status: 409 });
    }

    // 檢查 email 唯一性（排除自身）
    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .ilike('email', email)
      .neq('id', virtualUserId)
      .single();

    if (existingEmail) {
      return NextResponse.json({ error: '此電子郵件已被使用' }, { status: 409 });
    }

    // 更新虛擬用戶為正式會員
    const hashedPassword = await bcrypt.hash(password, 10);

    const { error: updateError } = await supabase
      .from('users')
      .update({
        username: validation.data.username,
        display_name: validation.data.display_name,
        email: validation.data.email.toLowerCase().trim(),
        password: hashedPassword,
        is_virtual: false,
      })
      .eq('id', virtualUserId);

    if (updateError) throw updateError;

    // 自動登入
    await createSession(virtualUserId, validation.data.username);

    return NextResponse.json({ success: true, message: '註冊成功' });
  } catch (error) {
    console.error('Convert virtual member error:', error);
    return NextResponse.json({ error: '轉換虛擬成員失敗' }, { status: 500 });
  }
}
