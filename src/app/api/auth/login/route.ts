import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';
import { createSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // 驗證輸入
    if (!username || !password) {
      return NextResponse.json({ error: '請輸入用戶名和密碼' }, { status: 400 });
    }

    // 查找用戶
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, display_name, password')
      .eq('username', username)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: '用戶名或密碼錯誤' }, { status: 401 });
    }

    // 驗證密碼
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: '用戶名或密碼錯誤' }, { status: 401 });
    }

    // 創建 session
    await createSession(user.id, user.username);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: '登入失敗,請稍後再試' }, { status: 500 });
  }
}
