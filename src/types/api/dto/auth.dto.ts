import type { User } from '../../models/user';

/**
 * 登入請求
 */
export interface LoginDto {
  username: string;
  password: string;
}

/**
 * 註冊請求
 */
export interface RegisterDto {
  username: string;
  display_name: string;
  password: string;
}

/**
 * 更新個人資料請求
 */
export interface UpdateProfileDto {
  display_name?: string;
  current_password?: string;
  new_password?: string;
}

/**
 * 認證回應
 */
export interface AuthResponseDto {
  user: User;
  message?: string;
}
