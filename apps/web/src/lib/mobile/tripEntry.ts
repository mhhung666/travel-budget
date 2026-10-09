import mongoose from 'mongoose';
import {
  clientRequestIdSchema,
  tripCreateInput,
  tripJoinInput,
  mutationRequestV2Schema,
  invitationSchema,
} from '@travel-budget/contracts';
import { dbConnect } from '@/lib/mongodb';
import { enterTrip, readTripMutation, TripEntryError } from '@/lib/tripEntry';
import { deliverJoinNotification } from '@/lib/notify';
import { getEnv } from '@/lib/env';
import { ApiError, readBody } from './http';
import { requireTripMember } from './access';

export function tripEntryError(error: unknown): unknown {
  if (error instanceof TripEntryError) {
    if (error.code === 'BUSY') return new ApiError(429, 'BUSY', 1);
    if (
      [
        'IDEMPOTENCY_CONFLICT',
        'FEATURE_NOT_AVAILABLE',
        'LEDGER_CURRENCY_MISMATCH',
        'CLIENT_UPGRADE_REQUIRED',
      ].includes(error.code)
    )
      return new ApiError(409, error.code);
    return new ApiError(404, error.code);
  }
  if (
    (error as { hasErrorLabel?: (v: string) => boolean })?.hasErrorLabel?.(
      'TransientTransactionError'
    )
  )
    return new ApiError(429, 'BUSY', 1);
  return error;
}
export async function mobileEnterTrip(
  request: Request,
  actorId: string,
  operation: 'trip.create' | 'trip.join'
) {
  const input =
    operation === 'trip.create'
      ? await readBody(request, tripCreateInput)
      : await readBody(request, tripJoinInput);
  await dbConnect();
  try {
    return await enterTrip(
      mongoose.connection.db!,
      actorId,
      operation,
      input,
      deliverJoinNotification
    );
  } catch (error) {
    throw tripEntryError(error);
  }
}
export async function mobileMutationRequest(actorId: string, uuid: string) {
  const key = clientRequestIdSchema.safeParse(uuid);
  if (!key.success) throw new ApiError(400, 'VALIDATION_ERROR');
  await dbConnect();
  try {
    return mutationRequestV2Schema.parse(
      await readTripMutation(mongoose.connection.db!, actorId, key.data)
    );
  } catch (error) {
    throw tripEntryError(error);
  }
}
export async function mobileInvitation(actorId: string, id: string) {
  const tripId = await requireTripMember(actorId, id);
  // Authorization is repeated in the data read, including deletion and member removal races.
  const trip = await mongoose.connection.db!.collection('trips').findOne(
    {
      _id: new mongoose.mongo.ObjectId(tripId),
      'members.user': new mongoose.mongo.ObjectId(actorId),
      expenseDeliveryDeleting: { $ne: true },
    },
    { projection: { hashCode: 1 } }
  );
  if (!trip) throw new ApiError(404, 'NOT_FOUND');
  const web = new URL(getEnv().APP_URL ?? '');
  if (!['http:', 'https:'].includes(web.protocol)) throw new Error('Invalid Web origin');
  const origin = web.origin;
  return invitationSchema.parse({ code: trip.hashCode, url: `${origin}/join/${trip.hashCode}` });
}
