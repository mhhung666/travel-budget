import { getTripMembership } from '@/lib/permissions';
import { ApiError } from './http';
import { idSchema } from './contract';

/**
 * Authorizes a bearer user for one trip and returns the trip ObjectId.
 * Native `/api/v1` accepts member ObjectIds only: share codes never fall back to public data, and
 * malformed ids, missing trips and non-members are indistinguishable (404).
 */
export async function requireTripMember(userId: string, tripId: string): Promise<string> {
  if (!idSchema.safeParse(tripId).success) throw new ApiError(404, 'NOT_FOUND');
  const membership = await getTripMembership(userId, tripId);
  if (!membership) throw new ApiError(404, 'NOT_FOUND');
  return membership.tripId;
}
