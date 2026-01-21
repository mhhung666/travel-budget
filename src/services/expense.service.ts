import { api } from './api';

export interface ExpenseSplit {
  user_id: number;
  username: string;
  display_name: string;
  share_amount: number;
}

export interface Expense {
  id: number;
  trip_id: number;
  payer_id: number;
  payer_name: string;
  amount: number; // TWD converted amount
  original_amount: number;
  currency: string;
  exchange_rate: number;
  description: string;
  category: string; // expense category
  date: string;
  created_at: string;
  splits: ExpenseSplit[];
}

export interface CreateExpenseRequest {
  payer_id: number;
  original_amount: number;
  currency: string;
  exchange_rate: number;
  description: string;
  category: string;
  date: string;
  split_with: number[];
}

export interface UpdateExpenseRequest {
  original_amount?: number;
  currency?: string;
  exchange_rate?: number;
  description?: string;
  category?: string;
}

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
  createExpense: (tripId: string, data: CreateExpenseRequest) =>
    api.post<{ expense: Expense }>(`/api/trips/${tripId}/expenses`, data),

  /**
   * Update an expense (payer only)
   */
  updateExpense: (tripId: string, expenseId: number, data: UpdateExpenseRequest) =>
    api.put<{ expense: Expense }>(`/api/trips/${tripId}/expenses/${expenseId}`, data),

  /**
   * Delete an expense (payer only)
   */
  deleteExpense: (tripId: string, expenseId: number) =>
    api.delete<{ message: string }>(`/api/trips/${tripId}/expenses/${expenseId}`),
};
