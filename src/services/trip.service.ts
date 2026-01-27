import { api } from './api';
import type {
  Trip,
  TripWithMembers,
  CreateTripDto,
  UpdateTripDto,
} from '@/types';

/**
 * Trip service
 */
export const tripService = {
  /**
   * Get all trips for the current user
   */
  getTrips: () => api.get<{ trips: TripWithMembers[] }>('/api/trips'),

  /**
   * Get a single trip by ID or hash code
   */
  getTrip: (id: string) => api.get<{ trip: Trip }>(`/api/trips/${id}`),

  /**
   * Create a new trip
   */
  createTrip: (data: CreateTripDto) => api.post<{ trip: Trip }>('/api/trips', data),

  /**
   * Update a trip
   */
  updateTrip: (id: string, data: UpdateTripDto) =>
    api.put<{ trip: Trip }>(`/api/trips/${id}`, data),

  /**
   * Delete a trip (admin only)
   */
  deleteTrip: (id: string) => api.delete<{ message: string }>(`/api/trips/${id}`),

  /**
   * Join a trip using hash code
   */
  joinTrip: (hashCode: string) =>
    api.post<{ trip: Trip; message: string }>('/api/trips/join', { hash_code: hashCode }),

  /**
   * Get trip info for joining (without authentication check)
   */
  getTripForJoin: (hashCode: string) =>
    api.get<{ trip: { name: string; member_count: number } }>(`/api/trips/join?code=${hashCode}`),
};
