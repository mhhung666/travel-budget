import { ApiError } from '@/api/client';
import type { PendingExpenseStore } from './pendingExpenses';

/** The web preview cannot sign in and has no database; expo-sqlite's web build is not bundled. */
export function openPendingExpenseStore(): Promise<PendingExpenseStore> {
  return Promise.reject(new ApiError('NATIVE_ONLY'));
}

export function openDraftTripStore(): Promise<import('./draftTrips').DraftTripStore> {
  return Promise.reject(new ApiError('NATIVE_ONLY'));
}

export function openExpenseQueueStore(): Promise<import('./expenseQueue').ExpenseQueueStore> {
  return Promise.reject(new ApiError('NATIVE_ONLY'));
}

export function openMutationStore(): Promise<import('./mutations').MutationStore> {
  return Promise.reject(new ApiError('NATIVE_ONLY'));
}
