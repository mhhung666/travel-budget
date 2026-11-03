import mongoose from 'mongoose';
import { clientRequestIdSchema, itineraryWriteInput } from '@travel-budget/contracts';
import {
  readItineraryEditContext,
  readItineraryWrite,
  writeItinerary,
  ItineraryWriteError,
} from '@/lib/itineraryWrite';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { ApiError, readBody } from './http';
import { requireTripMember } from './access';
import { tripEntryError } from './tripEntry';
function mapError(error: unknown) {
  if (error instanceof TripWriteError) return new ApiError(403, 'FORBIDDEN');
  if (error instanceof ItineraryWriteError) return new ApiError(409, error.code);
  return tripEntryError(error);
}
export async function mobileItineraryEditContext(actorId: string, id: string) {
  const tripId = await requireTripMember(actorId, id);
  try {
    return await readItineraryEditContext(mongoose.connection.db!, actorId, tripId);
  } catch (error) {
    throw mapError(error);
  }
}
export async function mobileItineraryWrite(request: Request, actorId: string, id: string) {
  const tripId = await requireTripMember(actorId, id);
  // Daily Markdown may exceed the ordinary small JSON body limit; still bound the stream.
  const input = await readBody(request, itineraryWriteInput, 256 * 1024);
  try {
    return await writeItinerary(mongoose.connection.db!, actorId, tripId, input);
  } catch (error) {
    throw mapError(error);
  }
}
export async function mobileItineraryRequest(actorId: string, id: string, uuid: string) {
  const tripId = await requireTripMember(actorId, id);
  const parsed = clientRequestIdSchema.safeParse(uuid);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR');
  try {
    return await readItineraryWrite(mongoose.connection.db!, actorId, tripId, parsed.data);
  } catch (error) {
    throw mapError(error);
  }
}
