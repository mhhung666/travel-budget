import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const body = await request.json();
    const { display_name, current_password, new_password } = body;

    // 如果要更新顯示名稱
    if (display_name !== undefined) {
      if (!display_name || display_name.trim().length === 0) {
        return NextResponse.json({ error: '顯示名稱不能為空' }, { status: 400 });
      }

      const { error } = await supabase
        .from('users')
        .update({ display_name: display_name.trim() })
        .eq('id', session.userId);

      if (error) {
        throw error;
      }

      return NextResponse.json({
        success: true,
        message: '顯示名稱已更新',
      });
    }

    // 如果要更新密碼
    if (current_password && new_password) {
      // 驗證新密碼長度
      if (new_password.length < 6) {
        return NextResponse.json({ error: '新密碼至少需要 6 個字元' }, { status: 400 });
      }

      // 獲取當前用戶資料
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('password')
        .eq('id', session.userId)
        .single();

      if (fetchError || !user) {
        return NextResponse.json({ error: '用戶不存在' }, { status: 404 });
      }

      // 驗證當前密碼
      const isPasswordValid = await bcrypt.compare(current_password, user.password);
      if (!isPasswordValid) {
        return NextResponse.json({ error: '目前密碼錯誤' }, { status: 400 });
      }

      // 加密新密碼
      const hashedPassword = await bcrypt.hash(new_password, 10);

      // 更新密碼
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: hashedPassword })
        .eq('id', session.userId);

      if (updateError) {
        throw updateError;
      }

      return NextResponse.json({
        success: true,
        message: '密碼已更新',
      });
    }

    return NextResponse.json({ error: '請提供要更新的資料' }, { status: 400 });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: '更新失敗,請稍後再試' }, { status: 500 });
  }
}
