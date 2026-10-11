'use server';

import {
  AccountProfileError,
  readAccountDetails,
  updateAccountProfile,
} from '@/lib/accountProfile';
import { headers } from 'next/headers';
import {
  AccountEntryError,
  registerAccount,
  requestAccountReset,
  confirmAccountReset,
} from '@/lib/accountEntry';
import { accountEnvironment, deliverAccountReset, deliverAccountEmail } from '@/lib/accountAdapter';
import {
  requestAccountEmail,
  confirmAccountEmail,
  cancelAccountEmail,
  AccountEmailError,
} from '@/lib/accountEmail';
import { changeAccountPassword, AccountPasswordError } from '@/lib/accountPassword';
import { dbConnect } from '@/lib/mongodb';
import { User as UserModel } from '@/models';
import { createSession, deleteSession, getSession } from '@/lib/auth';
import {
  loginSchema,
  notificationPrefsSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  updateProfileSchema,
  type LoginInput,
  type RegisterInput,
  type RequestPasswordResetInput,
  type ResetPasswordInput,
  type UpdateProfileInput,
  type ConfirmEmailChangeInput,
} from '@/lib/validation';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { User } from '@/types';
import { logger } from '@/lib/logger';
import { unstable_rethrow } from 'next/navigation';
import { isAccountDuplicateKey } from '@/lib/mongoErrors';
import { verifyCredentials } from '@/lib/credentials';

export type AuthUser = Pick<User, 'id' | 'username' | 'display_name'>;
export type AuthUserWithCreatedAt = AuthUser & {
  created_at: string;
  email: string;
  avatar_url: string | null;
  notify_by_email: boolean;
};

// 不分大小寫的精確比對（取代 Postgres ilike）

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<ActionResult<AuthUserWithCreatedAt | null>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: true, data: null };
    }

    let user;
    try {
      user = await readAccountDetails(session.userId);
    } catch (error) {
      if (error instanceof AccountProfileError && error.code === 'NOT_FOUND')
        return { success: true, data: null };
      throw error;
    }

    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        email: user.email,
        created_at: user.createdAt,
        avatar_url: user.avatarUrl ?? null,
        // 缺值（舊資料）視為開啟，與 notify() 的 `!== false` 判定一致。
        notify_by_email: user.notifyByEmail !== false,
      },
    };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('Get current user error', error);
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

    const user = await verifyCredentials(username, password);
    if (!user) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    await createSession(user._id.toString(), user.username, user.password);

    return {
      success: true,
      data: {
        id: user._id.toString(),
        username: user.username,
        display_name: user.displayName,
      },
    };
  } catch (error) {
    logger.error('Login error', error);
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

    const { db, context } = await accountEnvironment(await headers());
    const user = await registerAccount(db, validation.data, context);
    // Cookie creation is an adapter concern; committed registration stays successful.
    await createSession(user.id, user.username).catch(() => {});
    return {
      success: true,
      data: { id: user.id, username: user.username, display_name: user.displayName },
    };
  } catch (error) {
    if (error instanceof AccountEntryError) {
      return {
        success: false,
        error: error.code === 'ACCOUNT_CONFLICT' ? 'CONFLICT' : error.code,
        code: error.code === 'ACCOUNT_CONFLICT' ? 'CONFLICT' : 'RATE_LIMITED',
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      };
    }
    if (isAccountDuplicateKey(error)) {
      return { success: false, error: 'CONFLICT', code: 'CONFLICT' };
    }
    logger.error('Registration failed');
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
    logger.error('Logout error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Update user profile
 */
export const updateProfile = withAuth(
  async (session, input: UpdateProfileInput): Promise<ActionResult<{ message: string }>> => {
    try {
      const validation = updateProfileSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { display_name, current_password, new_password } = validation.data;

      // Update display name（Email 變更改走 requestEmailChange / confirmEmailChange 寄碼驗證流程）
      if (display_name !== undefined) {
        try {
          await updateAccountProfile(session.userId, { displayName: display_name });
        } catch (error) {
          if (error instanceof AccountProfileError)
            return { success: false, error: error.code, code: error.code };
          throw error;
        }

        return { success: true, data: { message: '個人資料已更新' } };
      }

      if (current_password && new_password) {
        const { db, context } = await accountEnvironment(await headers());
        try {
          await changeAccountPassword(
            db,
            session.userId,
            { current_password, new_password },
            context
          );
        } catch (error) {
          if (error instanceof AccountEntryError)
            return {
              success: false,
              error: error.code,
              code: 'RATE_LIMITED',
              retryAfter: error.retryAfter,
            };
          if (error instanceof AccountPasswordError)
            return {
              success: false,
              error: error.code,
              code: error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'VALIDATION_ERROR',
            };
          throw error;
        }
        // The database already revokes every cookie; cookie cleanup cannot turn success into failure.
        await deleteSession().catch(() => {});
        return { success: true, data: { message: '密碼已更新' } };
      }

      return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
    } catch {
      logger.error('Update user failed');
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 更新通知偏好（目前：Email 通知開關 + 寄信語系）。
 * 站內通知一律保留（不可關），Email 為 opt-out。`locale` 由設定頁帶入當前 UI 語系，
 * 供 notify() 的 Email fan-out 決定寄信語系（站內通知仍靠前端依檢視者語系渲染）。
 */
export const updateNotificationPrefs = withAuth(
  async (
    session,
    input: { notify_by_email: boolean; locale?: string }
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const validation = notificationPrefsSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { notify_by_email, locale } = validation.data;
      const updateData: Record<string, unknown> = { notifyByEmail: notify_by_email };
      if (locale !== undefined) updateData.locale = locale;

      await dbConnect();
      await UserModel.updateOne({ _id: session.userId }, { $set: updateData });
      return { success: true, data: { message: 'OK' } };
    } catch (error) {
      logger.error('Update notification prefs error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** Web cookie adapter shares the anonymous account rules with Mobile. */
export async function requestPasswordReset(
  input: RequestPasswordResetInput
): Promise<ActionResult<{ message: string }>> {
  const parsed = requestPasswordResetSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
  try {
    const { db, context } = await accountEnvironment(await headers());
    await requestAccountReset(db, parsed.data, context, deliverAccountReset);
    return { success: true, data: { message: 'OK' } };
  } catch (error) {
    return accountActionFailure(error);
  }
}
export async function resetPassword(
  input: ResetPasswordInput
): Promise<ActionResult<{ message: string }>> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
  try {
    const { db, context } = await accountEnvironment(await headers());
    await confirmAccountReset(db, parsed.data, context);
    return { success: true, data: { message: '密碼已重設成功' } };
  } catch (error) {
    return accountActionFailure(error);
  }
}
function accountActionFailure(error: unknown): ActionResult<never> {
  if (error instanceof AccountEntryError)
    return {
      success: false,
      error: error.code,
      code: error.code === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'VALIDATION_ERROR',
      ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    };
  // Do not log request bodies, passwords, codes or database values from these public adapters.
  logger.error('Account entry failed');
  return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
}

// Web keeps the existing RPC results; all state transitions live in the shared service.
export const requestEmailChange = withAuth(
  async (
    session,
    input: { new_email: string; locale?: string }
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const { db, context } = await accountEnvironment(await headers());
      await requestAccountEmail(db, session.userId, input, context, deliverAccountEmail);
      return { success: true, data: { message: 'OK' } };
    } catch (error) {
      return emailFailure(error);
    }
  }
);
export const confirmEmailChange = withAuth(
  async (
    session,
    input: ConfirmEmailChangeInput
  ): Promise<ActionResult<{ message: string; email: string }>> => {
    try {
      const { db, context } = await accountEnvironment(await headers());
      const result = await confirmAccountEmail(db, session.userId, input, context);
      return { success: true, data: { message: 'OK', email: result.email } };
    } catch (error) {
      return emailFailure(error);
    }
  }
);
export const cancelEmailChange = withAuth(
  async (session): Promise<ActionResult<{ message: string }>> => {
    try {
      const { db } = await accountEnvironment(await headers());
      await cancelAccountEmail(db, session.userId);
      return { success: true, data: { message: 'OK' } };
    } catch (error) {
      return emailFailure(error);
    }
  }
);
function emailFailure(error: unknown): ActionResult<never> {
  if (error instanceof AccountEntryError)
    return {
      success: false,
      error: error.code,
      code: 'RATE_LIMITED',
      retryAfter: error.retryAfter,
    };
  if (error instanceof AccountEmailError)
    return {
      success: false,
      error: error.code,
      code:
        error.code === 'CONFLICT'
          ? 'CONFLICT'
          : error.code === 'NOT_FOUND'
            ? 'NOT_FOUND'
            : error.code === 'RESOURCE_CHANGED'
              ? 'RESOURCE_CHANGED'
              : 'VALIDATION_ERROR',
    };
  logger.error('Email change failed');
  return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
}
