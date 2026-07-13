/**
 * Types Module
 *
 * 統一導出所有類型定義，使用方式：
 *
 * @example
 * // 匯入類型
 * import type { User, Trip, Expense } from '@/types';
 *
 * // 匯入常數（從 constants）
 * import { CURRENCIES } from '@/constants/currencies';
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
  TripCurrency,
  TripCurrencySettings,
  Budget,
  BudgetCategory,
  CategoryBudgetProgress,
  BudgetProgress,
  Expense,
  ExpenseAttachment,
  ExpenseSplit,
  UserBalance,
  Transfer,
  SettlementData,
  Balance,
  Transaction,
  PaymentRecord,
  Settlement,
  ExpenseDetail,
  CategoryStat,
  TagStat,
  StatsData,
  MemberSpend,
  DailySpend,
  TripStatsData,
  YearInReviewData,
  YearInReviewCategory,
  TimeInterval,
  HistogramDataPoint,
  HistogramData,
  ItineraryDay,
  Activity,
  ActivityType,
  Checklist,
  ChecklistItem,
  ChecklistKind,
  NotificationItem,
  NotificationType,
  NotificationMeta,
  ActivityLogItem,
  ActivityLogType,
  ActivityLogMeta,
  CommentDto,
  TripNote,
  FriendshipStatus,
  FriendItem,
  FriendsData,
  DatePrecision,
  CabinClass,
  FlightRecordItem,
  StayRecordItem,
  VisitedCountryItem,
  CollectionsData,
} from './models';

// ============================================
// Common - 通用類型
// ============================================
export type { Location, LocalizedNames, Currency } from './common';

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
