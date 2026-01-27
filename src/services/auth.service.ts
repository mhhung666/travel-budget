import { api } from './api';
import type {
  User,
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  UpdateProfileDto,
} from '@/types';

/**
 * Authentication service
 */
export const authService = {
  /**
   * Login with username and password
   */
  login: (data: LoginDto) => api.post<AuthResponseDto>('/api/auth/login', data),

  /**
   * Register a new user
   */
  register: (data: RegisterDto) => api.post<AuthResponseDto>('/api/auth/register', data),

  /**
   * Logout current user
   */
  logout: () => api.post<{ message: string }>('/api/auth/logout'),

  /**
   * Get current user info
   */
  me: () => api.get<{ user: User }>('/api/auth/me'),

  /**
   * Update user profile (display name or password)
   */
  updateProfile: (data: UpdateProfileDto) =>
    api.put<{ message: string; user?: User }>('/api/auth/update', data),
};
