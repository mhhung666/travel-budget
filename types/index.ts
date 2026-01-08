export interface User {
  id: number;
  username: string;
  display_name: string;
  created_at: string;
}

export interface Trip {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface TripMember {
  id: number;
  trip_id: number;
  user_id: number;
  joined_at: string;
}

export interface Expense {
  id: number;
  trip_id: number;
  payer_id: number;
  amount: number;
  description: string;
  date: string;
  created_at: string;
}

export interface ExpenseSplit {
  id: number;
  expense_id: number;
  user_id: number;
  share_amount: number;
}

export interface ExpenseWithDetails extends Expense {
  payer_name: string;
  splits: Array<{
    user_id: number;
    username: string;
    share_amount: number;
  }>;
}

export interface UserBalance {
  user_id: number;
  username: string;
  total_paid: number;
  total_owed: number;
  balance: number;
}
