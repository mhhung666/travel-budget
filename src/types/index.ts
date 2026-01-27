/**
 * Types Module
 *
 * 統一導出所有類型定義，使用方式：
 *
 * @example
 * // 匯入所有類型
 * import type { User, Trip, Expense } from '@/types';
 *
 * // 匯入特定模組
 * import type { User } from '@/types/models';
 * import type { CreateTripDto } from '@/types/api';
 * import type { Location, Currency } from '@/types/common';
 */

// ============================================
// Models - 資料模型
// ============================================
export type {
  User,
  TripRole,
  Member,
  Trip,
  TripWithMembers,
  TripMember,
  Expense,
  ExpenseSplit,
  UserBalance,
  Transfer,
  SettlementData,
} from './models';

// ============================================
// Common - 通用類型
// ============================================
export type { Location, Currency } from './common';
export { CURRENCIES } from './common';

// ============================================
// API - DTO 類型
// ============================================
export type {
  // Auth
  LoginDto,
  RegisterDto,
  UpdateProfileDto,
  AuthResponseDto,
  // Trip
  CreateTripDto,
  UpdateTripDto,
  // Expense
  CreateExpenseDto,
  UpdateExpenseDto,
  // Common
  ApiResponse,
} from './api';
