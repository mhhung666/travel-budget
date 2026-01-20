import { api } from './api';
import type { User } from '@/hooks/useAuth';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  display_name: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  message?: string;
}

export interface UpdateProfileRequest {
  display_name?: string;
  current_password?: string;
  new_password?: string;
}

/**
 * Authentication service
 */
export const authService = {
  /**
   * Login with username and password
   */
  login: (data: LoginRequest) => api.post<AuthResponse>('/api/auth/login', data),

  /**
   * Register a new user
   */
  register: (data: RegisterRequest) => api.post<AuthResponse>('/api/auth/register', data),

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
  updateProfile: (data: UpdateProfileRequest) =>
    api.put<{ message: string; user?: User }>('/api/auth/update', data),
};
