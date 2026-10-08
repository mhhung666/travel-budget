/**
 * Standard result type for all Server Actions
 * Provides consistent error handling across the application
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: ErrorCode; retryAfter?: number };

/**
 * Common error codes for client-side handling
 */
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  BUSY: 'BUSY',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  SETTLEMENT_CHANGED: 'SETTLEMENT_CHANGED',
  INVITATION_INVALID: 'INVITATION_INVALID',
  RATE_LIMITED: 'RATE_LIMITED',
  ACTIVITY_LIMIT: 'ACTIVITY_LIMIT',
  // 依日期新增行程日：表單開啟後旅程起訖被改動，舊基準算出的 Day N 不可信。
  TRIP_DATES_CHANGED: 'TRIP_DATES_CHANGED',
  // 該日期／天數已經有行程日；手動新增一律阻擋，不合併也不覆寫。
  DAY_ALREADY_EXISTS: 'DAY_ALREADY_EXISTS',
  // 選定日期落在旅程起訖之外；首版不自動延長旅程。
  DATE_OUTSIDE_TRIP: 'DATE_OUTSIDE_TRIP',
  // 旅程沒有開始日，無法用日期定位，需改用「第幾天」或先設定開始日。
  TRIP_START_DATE_REQUIRED: 'TRIP_START_DATE_REQUIRED',
  LEDGER_DATA_INVALID: 'LEDGER_DATA_INVALID',
  LEDGER_CURRENCY_MISMATCH: 'LEDGER_CURRENCY_MISMATCH',
  MONEY_TOTAL_OUT_OF_RANGE: 'MONEY_TOTAL_OUT_OF_RANGE',
  FEATURE_NOT_AVAILABLE: 'FEATURE_NOT_AVAILABLE',
  CLIENT_UPGRADE_REQUIRED: 'CLIENT_UPGRADE_REQUIRED',
  RESOURCE_CHANGED: 'RESOURCE_CHANGED',
  RESOURCE_GONE: 'RESOURCE_GONE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
