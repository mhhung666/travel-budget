import mongoose from 'mongoose';
import { authorizeLedger, isLedgerV2, validateLedgerChildren } from '@/lib/ledger';
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
  authorizeLedger(membership);
  if (isLedgerV2()) {
    const trip = await mongoose.connection.db!.collection('trips').findOne({
      _id: new mongoose.mongo.ObjectId(tripId),
      'members.user': new mongoose.mongo.ObjectId(userId),
      expenseDeliveryDeleting: { $ne: true },
    });
    if (!trip) throw new ApiError(404, 'NOT_FOUND');
    await validateLedgerChildren(mongoose.connection.db!, { ...trip, _id: trip._id });
  }
  return membership.tripId;
}
