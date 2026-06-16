'use server';

import bcrypt from 'bcryptjs';
import { dbConnect } from '@/lib/mongodb';
import { User as UserModel } from '@/models';
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

export type AuthUser = Pick<User, 'id' | 'username' | 'display_name'>;
export type AuthUserWithCreatedAt = AuthUser & { created_at: string; email: string };

// 不分大小寫的精確比對（取代 Postgres ilike）
const CI = { locale: 'en', strength: 2 } as const;

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<ActionResult<AuthUserWithCreatedAt | null>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: true, data: null };
    }

    await dbConnect();
    const user = await UserModel.findById(session.userId)
      .select('username displayName email createdAt')
      .lean();

    if (!user) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        id: user._id.toString(),
        username: user.username,
        display_name: user.displayName,
        email: user.email,
        created_at: user.createdAt.toISOString(),
      },
    };
  } catch (error) {
    console.error('Get current user error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
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

    await dbConnect();
    const user = await UserModel.findOne({ username }).collation(CI);

    if (!user) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    await createSession(user._id.toString(), user.username);

    return {
      success: true,
      data: {
        id: user._id.toString(),
        username: user.username,
        display_name: user.displayName,
      },
    };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
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

    await dbConnect();

    // Check if username exists (case-insensitive)
    const existingUsername = await UserModel.findOne({ username }).collation(CI).select('_id');
    if (existingUsername) {
      return { success: false, error: 'CONFLICT', code: 'CONFLICT' };
    }

    // Check if email exists (case-insensitive)
    const existingEmail = await UserModel.findOne({ email }).collation(CI).select('_id');
    if (existingEmail) {
      return { success: false, error: 'CONFLICT', code: 'CONFLICT' };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await UserModel.create({
      username,
      displayName: display_name,
      email,
      password: hashedPassword,
    });

    await createSession(newUser._id.toString(), username);

    return {
      success: true,
      data: {
        id: newUser._id.toString(),
        username: newUser.username,
        display_name: newUser.displayName,
      },
    };
  } catch (error) {
    console.error('Registration error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
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
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
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
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
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

    await dbConnect();

    // Update display name and/or email
    if (display_name !== undefined || new_email !== undefined) {
      const updateData: Record<string, string> = {};

      if (display_name !== undefined) {
        updateData.displayName = display_name.trim();
      }

      if (new_email !== undefined) {
        // Check if email is already taken (case-insensitive), excluding self
        const existingEmail = await UserModel.findOne({
          email: new_email,
          _id: { $ne: session.userId },
        })
          .collation(CI)
          .select('_id');

        if (existingEmail) {
          return { success: false, error: 'CONFLICT', code: 'CONFLICT' };
        }

        updateData.email = new_email.toLowerCase().trim();
      }

      await UserModel.updateOne({ _id: session.userId }, { $set: updateData });

      return { success: true, data: { message: '個人資料已更新' } };
    }

    // Update password
    if (current_password && new_password) {
      const user = await UserModel.findById(session.userId).select('password');

      if (!user) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const isPasswordValid = await bcrypt.compare(current_password, user.password);
      if (!isPasswordValid) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const hashedPassword = await bcrypt.hash(new_password, 10);
      await UserModel.updateOne({ _id: session.userId }, { $set: { password: hashedPassword } });

      return { success: true, data: { message: '密碼已更新' } };
    }

    return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
  } catch (error) {
    console.error('Update user error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
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

    await dbConnect();

    // Find user by username (case-insensitive)
    const user = await UserModel.findOne({ username }).collation(CI).select('email');

    if (!user) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    // Verify email matches
    if (!user.email || user.email.toLowerCase() !== email.toLowerCase()) {
      return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
    }

    // Update password
    const hashedPassword = await bcrypt.hash(new_password, 10);
    await UserModel.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });

    return { success: true, data: { message: '密碼已重設成功' } };
  } catch (error) {
    console.error('Reset password error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}
