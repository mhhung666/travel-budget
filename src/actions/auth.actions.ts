'use server';

import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';
import { createSession, deleteSession, getSession } from '@/lib/auth';
import {
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type UpdateProfileInput,
} from '@/lib/validation';
import type { ActionResult } from './types';
import type { User } from '@/types';

type AuthUser = Pick<User, 'id' | 'username' | 'display_name'>;
type AuthUserWithCreatedAt = AuthUser & { created_at: string; email?: string };

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<ActionResult<AuthUserWithCreatedAt | null>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: true, data: null };
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, display_name, email, created_at')
      .eq('id', session.userId)
      .single();

    if (error || !user) {
      return { success: true, data: null };
    }

    return { success: true, data: user };
  } catch (error) {
    console.error('Get current user error:', error);
    return { success: false, error: '獲取用戶信息失敗', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Login user
 */
export async function login(input: LoginInput): Promise<ActionResult<AuthUser>> {
  try {
    const validation = loginSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      };
    }

    const { username, password } = validation.data;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, display_name, password')
      .ilike('username', username)
      .single();

    if (error || !user) {
      return { success: false, error: '用戶名或密碼錯誤', code: 'UNAUTHORIZED' };
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return { success: false, error: '用戶名或密碼錯誤', code: 'UNAUTHORIZED' };
    }

    await createSession(user.id, user.username);

    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
      },
    };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: '登入失敗,請稍後再試', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Register new user
 */
export async function register(input: RegisterInput): Promise<ActionResult<AuthUser>> {
  try {
    const validation = registerSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      };
    }

    const { username, display_name, email, password } = validation.data;

    // Check if username exists (case-insensitive)
    const { data: existingUsername } = await supabase
      .from('users')
      .select('id')
      .ilike('username', username)
      .single();

    if (existingUsername) {
      return { success: false, error: '用戶名已被使用', code: 'CONFLICT' };
    }

    // Check if email exists (case-insensitive)
    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .ilike('email', email)
      .single();

    if (existingEmail) {
      return { success: false, error: '此電子郵件已被使用', code: 'CONFLICT' };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{ username, display_name, email, password: hashedPassword }])
      .select()
      .single();

    if (error) throw error;

    await createSession(newUser.id, username);

    return {
      success: true,
      data: {
        id: newUser.id,
        username: newUser.username,
        display_name: newUser.display_name,
      },
    };
  } catch (error) {
    console.error('Registration error:', error);
    return { success: false, error: '註冊失敗,請稍後再試', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Logout user
 */
export async function logout(): Promise<ActionResult<{ message: string }>> {
  try {
    await deleteSession();
    return { success: true, data: { message: '登出成功' } };
  } catch (error) {
    console.error('Logout error:', error);
    return { success: false, error: '登出失敗', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Update user profile
 */
export async function updateProfile(
  input: UpdateProfileInput
): Promise<ActionResult<{ message: string }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const validation = updateProfileSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      };
    }

    const { display_name, new_email, current_password, new_password } = validation.data;

    // Update display name
    if (display_name !== undefined) {
      const { error } = await supabase
        .from('users')
        .update({ display_name: display_name.trim() })
        .eq('id', session.userId);

      if (error) throw error;

      return { success: true, data: { message: '顯示名稱已更新' } };
    }

    // Update email
    if (new_email !== undefined) {
      // Check if email is already taken (case-insensitive)
      const { data: existingEmail } = await supabase
        .from('users')
        .select('id')
        .ilike('email', new_email)
        .neq('id', session.userId)
        .single();

      if (existingEmail) {
        return { success: false, error: '此電子郵件已被使用', code: 'CONFLICT' };
      }

      const { error } = await supabase
        .from('users')
        .update({ email: new_email.toLowerCase().trim() })
        .eq('id', session.userId);

      if (error) throw error;

      return { success: true, data: { message: '電子郵件已更新' } };
    }

    // Update password
    if (current_password && new_password) {
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('password')
        .eq('id', session.userId)
        .single();

      if (fetchError || !user) {
        return { success: false, error: '用戶不存在', code: 'NOT_FOUND' };
      }

      const isPasswordValid = await bcrypt.compare(current_password, user.password);
      if (!isPasswordValid) {
        return { success: false, error: '目前密碼錯誤', code: 'VALIDATION_ERROR' };
      }

      const hashedPassword = await bcrypt.hash(new_password, 10);

      const { error: updateError } = await supabase
        .from('users')
        .update({ password: hashedPassword })
        .eq('id', session.userId);

      if (updateError) throw updateError;

      return { success: true, data: { message: '密碼已更新' } };
    }

    return { success: false, error: '請提供要更新的資料', code: 'VALIDATION_ERROR' };
  } catch (error) {
    console.error('Update user error:', error);
    return { success: false, error: '更新失敗,請稍後再試', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Reset password (for forgot password)
 */
export async function resetPassword(
  input: ResetPasswordInput
): Promise<ActionResult<{ message: string }>> {
  try {
    const validation = resetPasswordSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      };
    }

    const { username, email, new_password } = validation.data;

    // Find user by username (case-insensitive) and email
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email')
      .ilike('username', username)
      .single();

    if (fetchError || !user) {
      return { success: false, error: '找不到此用戶', code: 'NOT_FOUND' };
    }

    // Verify email matches
    if (!user.email || user.email.toLowerCase() !== email.toLowerCase()) {
      return { success: false, error: '帳戶與電子郵件不符', code: 'VALIDATION_ERROR' };
    }

    // Update password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    const { error: updateError } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', user.id);

    if (updateError) throw updateError;

    return { success: true, data: { message: '密碼已重設成功' } };
  } catch (error) {
    console.error('Reset password error:', error);
    return { success: false, error: '重設密碼失敗,請稍後再試', code: 'INTERNAL_ERROR' };
  }
}
