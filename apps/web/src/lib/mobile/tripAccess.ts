import mongoose from 'mongoose';
import {
  idSchema,
  tripAccessInput,
  tripAccessContextSchema,
  memberClaimInvitationSchema,
} from '@travel-budget/contracts';
import { dbConnect } from '@/lib/mongodb';
import { getEnv } from '@/lib/env';
import { readTripAccess, manageTripAccess } from '@/lib/tripAccess';
import { withTripWriteInDatabase, TripWriteError } from '@/lib/tripWriteTransaction';
import { TripEntryError } from '@/lib/tripEntry';
import { requireTripMember } from './access';
import { ApiError, readBody } from './http';
import { tripEntryError } from './tripEntry';
function mapError(error: unknown) {
  if (error instanceof TripWriteError) return new ApiError(404, 'NOT_FOUND');
  if (error instanceof TripEntryError && error.code === 'FORBIDDEN')
    return new ApiError(403, error.code);
  if (
    error instanceof TripEntryError &&
    ['RESOURCE_CHANGED', 'RESOURCE_GONE', 'VALIDATION_ERROR'].includes(error.code)
  )
    return new ApiError(409, error.code);
  return tripEntryError(error);
}
export async function mobileTripAccess(actorId: string, id: string) {
  const tripId = await requireTripMember(actorId, id);
  try {
    return tripAccessContextSchema.parse(
      await readTripAccess(mongoose.connection.db!, actorId, tripId, getEnv().JWT_SECRET)
    );
  } catch (error) {
    throw mapError(error);
  }
}
export async function mobileManageTripAccess(request: Request, actorId: string, id: string) {
  if (!idSchema.safeParse(id).success) throw new ApiError(404, 'NOT_FOUND');
  const body = await readBody(request, tripAccessInput);
  await dbConnect();
  try {
    return await manageTripAccess(mongoose.connection.db!, actorId, id, body, getEnv().JWT_SECRET);
  } catch (error) {
    throw mapError(error);
  }
}
/** Existing Web claim capability; recipient supplies credentials on the Web, never on this device. */
export async function mobileMemberClaimInvitation(actorId: string, id: string, memberId: string) {
  const tripId = await requireTripMember(actorId, id);
  if (!idSchema.safeParse(memberId).success) throw new ApiError(404, 'RESOURCE_GONE');
  try {
    return await withTripWriteInDatabase(
      mongoose.connection.db!,
      tripId,
      actorId,
      async (session) => {
        const db = mongoose.connection.db!;
        const parent = await db
          .collection('trips')
          .findOne({ _id: new mongoose.mongo.ObjectId(tripId) }, { session });
        if (
          !parent?.members.some(
            (m: { user: mongoose.mongo.ObjectId; role?: string }) =>
              m.user.toString() === actorId && m.role === 'admin'
          )
        )
          throw new TripEntryError('FORBIDDEN');
        if (
          !parent?.members.some(
            (m: { user: mongoose.mongo.ObjectId }) => m.user.toString() === memberId
          )
        )
          throw new TripEntryError('RESOURCE_GONE');
        const user = await db
          .collection('users')
          .findOne(
            { _id: new mongoose.mongo.ObjectId(memberId), isVirtual: true },
            { session, projection: { username: 1 } }
          );
        if (!user) throw new TripEntryError('RESOURCE_GONE');
        const web = new URL(getEnv().APP_URL ?? '');
        if (!['http:', 'https:'].includes(web.protocol)) throw new Error('Invalid Web origin');
        return memberClaimInvitationSchema.parse({
          url: `${web.origin}/link-virtual/${encodeURIComponent(parent.hashCode)}/${encodeURIComponent(user.username)}`,
        });
      }
    );
  } catch (error) {
    throw mapError(error);
  }
}
