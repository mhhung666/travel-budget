import { api } from './api';
import type { Member } from '@/types';

/**
 * Member service
 */
export const memberService = {
  /**
   * Get all members of a trip
   */
  getMembers: (tripId: string) => api.get<{ members: Member[] }>(`/api/trips/${tripId}/members`),

  /**
   * Remove a member from a trip (admin only)
   */
  removeMember: (tripId: string, userId: number) =>
    api.delete<{ message: string }>(`/api/trips/${tripId}/members/${userId}`),
};
