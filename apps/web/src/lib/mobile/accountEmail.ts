import { AccountEmailError } from '@/lib/accountEmail';
import { AccountEntryError } from '@/lib/accountEntry';
import { ApiError } from './http';
export function emailHttpFailure(error: unknown): never {
  if (error instanceof AccountEntryError) throw new ApiError(429, error.code, error.retryAfter);
  if (error instanceof AccountEmailError)
    throw new ApiError(
      error.code === 'NOT_FOUND'
        ? 404
        : ['RESOURCE_CHANGED', 'CONFLICT'].includes(error.code)
          ? 409
          : error.code === 'EMAIL_DELIVERY_FAILED'
            ? 503
            : 400,
      error.code
    );
  throw error;
}
