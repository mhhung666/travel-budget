import { ApiError } from '@/api/client';
import type { Messages } from '@/i18n/messages';
export function errorMessage(error: unknown, t: Messages): string {
  if (!(error instanceof ApiError)) return t.genericError;
  if (error.code === 'CONFIGURATION') return t.configurationError;
  if (error.code === 'STORAGE') return t.storageError;
  if (error.code === 'NATIVE_ONLY') return t.nativeOnly;
  if (error.code === 'INVALID_CREDENTIALS') return t.invalidCredentials;
  if (error.code === 'NETWORK') return t.networkError;
  if (error.code === 'TIMEOUT') return t.timeoutError;
  if (error.status === 429) return t.rateLimited;
  if (error.status === 401) return t.sessionExpired;
  if (error.status === 403 || error.status === 404) return t.notFound;
  return t.genericError;
}

/** The server treats lost membership and unknown resources alike; never keep showing stale private data. */
export function isAccessDenied(error: unknown): boolean {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}
