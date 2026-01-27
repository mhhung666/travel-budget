import { api } from './api';
import type {
  Expense,
  CreateExpenseDto,
  UpdateExpenseDto,
} from '@/types';

/**
 * Expense service
 */
export const expenseService = {
  /**
   * Get all expenses for a trip
   */
  getExpenses: (tripId: string) =>
    api.get<{ expenses: Expense[] }>(`/api/trips/${tripId}/expenses`),

  /**
   * Get a single expense
   */
  getExpense: (tripId: string, expenseId: number) =>
    api.get<{ expense: Expense }>(`/api/trips/${tripId}/expenses/${expenseId}`),

  /**
   * Create a new expense
   */
  createExpense: (tripId: string, data: CreateExpenseDto) =>
    api.post<{ expense: Expense }>(`/api/trips/${tripId}/expenses`, data),

  /**
   * Update an expense (payer only)
   */
  updateExpense: (tripId: string, expenseId: number, data: UpdateExpenseDto) =>
    api.put<{ expense: Expense }>(`/api/trips/${tripId}/expenses/${expenseId}`, data),

  /**
   * Delete an expense (payer only)
   */
  deleteExpense: (tripId: string, expenseId: number) =>
    api.delete<{ message: string }>(`/api/trips/${tripId}/expenses/${expenseId}`),
};
