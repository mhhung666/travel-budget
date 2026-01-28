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
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
