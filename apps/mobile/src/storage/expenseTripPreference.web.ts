import { ApiError } from '@/api/client';
import type { LastExpenseTripStore } from './lastExpenseTrip';
export function openLastExpenseTripStore(): Promise<LastExpenseTripStore> {
  return Promise.reject(new ApiError('NATIVE_ONLY'));
}
