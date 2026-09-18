/**
 * Standard result type for all Server Actions
 * Provides consistent error handling across the application
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: ErrorCode };

/**
 * Common error codes for client-side handling
 */
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  ACTIVITY_LIMIT: 'ACTIVITY_LIMIT',
  // 依日期新增行程日：表單開啟後旅程起訖被改動，舊基準算出的 Day N 不可信。
  TRIP_DATES_CHANGED: 'TRIP_DATES_CHANGED',
  // 該日期／天數已經有行程日；手動新增一律阻擋，不合併也不覆寫。
  DAY_ALREADY_EXISTS: 'DAY_ALREADY_EXISTS',
  // 選定日期落在旅程起訖之外；首版不自動延長旅程。
  DATE_OUTSIDE_TRIP: 'DATE_OUTSIDE_TRIP',
  // 旅程沒有開始日，無法用日期定位，需改用「第幾天」或先設定開始日。
  TRIP_START_DATE_REQUIRED: 'TRIP_START_DATE_REQUIRED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
