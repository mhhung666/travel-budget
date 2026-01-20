import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';
import { createSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, display_name, password } = body;

    // 驗證輸入
    if (!username || !display_name || !password) {
      return NextResponse.json({ error: '所有欄位都是必填的' }, { status: 400 });
    }

    if (username.length < 3) {
      return NextResponse.json({ error: '用戶名至少需要 3 個字符' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '密碼至少需要 6 個字符' }, { status: 400 });
    }

    // 檢查用戶名是否已存在
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existingUser) {
      return NextResponse.json({ error: '用戶名已被使用' }, { status: 409 });
    }

    // 加密密碼
    const hashedPassword = await bcrypt.hash(password, 10);

    // 創建用戶
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{ username, display_name, password: hashedPassword }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    // 創建 session
    await createSession(newUser.id, username);

    return NextResponse.json(
      {
        success: true,
        user: {
          id: newUser.id,
          username: newUser.username,
          display_name: newUser.display_name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: '註冊失敗,請稍後再試' }, { status: 500 });
  }
}
