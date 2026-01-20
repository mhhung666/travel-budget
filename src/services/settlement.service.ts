import { api } from './api';

export interface UserBalance {
  user_id: number;
  username: string;
  display_name: string;
  total_paid: number;
  total_owed: number;
  balance: number;
}

export interface Transfer {
  from_id: number;
  from_name: string;
  to_id: number;
  to_name: string;
  amount: number;
}

export interface SettlementData {
  balances: UserBalance[];
  transfers: Transfer[];
  total_expenses: number;
}

/**
 * Settlement service
 */
export const settlementService = {
  /**
   * Get settlement data for a trip
   */
  getSettlement: (tripId: string) =>
    api.get<SettlementData>(`/api/trips/${tripId}/settlement`),
};
