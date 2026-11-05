import mongoose from 'mongoose';
import {
  activityDeletionInput,
  activityDeletionPreviewInput,
  clientRequestIdSchema,
} from '@travel-budget/contracts';
import {
  deleteActivities,
  previewActivityDeletion,
  readActivityDeletion,
} from '@/lib/itineraryBatchDelete';
import { ItineraryWriteError } from '@/lib/itineraryWrite';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { requireTripMember } from './access';
import { ApiError, readBody } from './http';
import { tripEntryError } from './tripEntry';
export async function mobileActivityDeletion(
  request: Request,
  actor: string,
  id: string,
  operation: 'preview' | 'write' | 'lookup',
  uuid?: string
) {
  const tripId = await requireTripMember(actor, id);
  try {
    const db = mongoose.connection.db!;
    if (operation === 'preview')
      return await previewActivityDeletion(
        db,
        actor,
        tripId,
        await readBody(request, activityDeletionPreviewInput)
      );
    if (operation === 'write')
      return await deleteActivities(
        db,
        actor,
        tripId,
        await readBody(request, activityDeletionInput)
      );
    const parsed = clientRequestIdSchema.safeParse(uuid);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR');
    return await readActivityDeletion(db, actor, tripId, parsed.data);
  } catch (error) {
    if (error instanceof TripWriteError) throw new ApiError(403, 'FORBIDDEN');
    if (error instanceof ItineraryWriteError)
      throw new ApiError(error.code === 'NOT_FOUND' ? 404 : 409, error.code);
    throw tripEntryError(error);
  }
}
