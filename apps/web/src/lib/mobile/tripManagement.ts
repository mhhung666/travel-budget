import mongoose from 'mongoose';
import { tripUpdateInput, tripArchiveInput } from '@travel-budget/contracts';
import { manageTrip, readTripSettings, TripManagementError } from '@/lib/tripManagement';
import { TripEntryError } from '@/lib/tripEntry';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { getEnv } from '@/lib/env';
import { requireTripMember } from './access';
import { ApiError, readBody } from './http';
import { tripEntryError } from './tripEntry';
function mapError(error: unknown) {
  if (error instanceof TripManagementError)
    return new ApiError(error.code === 'FORBIDDEN' ? 403 : 400, error.code);
  if (error instanceof TripEntryError && error.code === 'FORBIDDEN')
    return new ApiError(403, 'FORBIDDEN');
  if (error instanceof TripWriteError) return new ApiError(404, 'NOT_FOUND');
  if (
    error instanceof TripEntryError &&
    ['RESOURCE_CHANGED', 'VALIDATION_ERROR'].includes(error.code)
  )
    return new ApiError(409, error.code);
  return tripEntryError(error);
}
export async function mobileTripSettings(actorId: string, id: string) {
  const tripId = await requireTripMember(actorId, id);
  try {
    return await readTripSettings(mongoose.connection.db!, actorId, tripId, getEnv().JWT_SECRET);
  } catch (error) {
    throw mapError(error);
  }
}
export async function mobileManageTrip(
  request: Request,
  actorId: string,
  id: string,
  operation: 'trip.update' | 'trip.archive'
) {
  const tripId = await requireTripMember(actorId, id);
  const body =
    operation === 'trip.update'
      ? await readBody(request, tripUpdateInput)
      : await readBody(request, tripArchiveInput);
  try {
    return await manageTrip(
      mongoose.connection.db!,
      actorId,
      tripId,
      operation,
      body,
      getEnv().JWT_SECRET
    );
  } catch (error) {
    throw mapError(error);
  }
}
