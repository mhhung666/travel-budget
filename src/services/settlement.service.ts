import { api } from './api';
import type { SettlementData } from '@/types';

/**
 * Settlement service
 */
export const settlementService = {
  /**
   * Get settlement data for a trip
   */
  getSettlement: (tripId: string) => api.get<SettlementData>(`/api/trips/${tripId}/settlement`),
};
