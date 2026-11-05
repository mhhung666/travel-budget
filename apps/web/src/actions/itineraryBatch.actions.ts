'use server';
import mongoose from 'mongoose';
import { clientRequestIdSchema } from '@travel-budget/contracts';
import { getTripMembership } from '@/lib/permissions';
import {
  deleteActivities,
  previewActivityDeletion,
  readActivityDeletion,
} from '@/lib/itineraryBatchDelete';
import { withLedgerAuth } from './withAuth';
import { TripWriteError } from '@/lib/tripWriteTransaction';

async function tripFor(actor: string, id: string) {
  const membership = await getTripMembership(actor, id);
  if (membership?.role !== 'admin') throw new TripWriteError('FORBIDDEN');
  return membership.tripId;
}
export const previewWebActivityDeletion = withLedgerAuth(
  async (session, id: string, body: unknown) => {
    const tripId = await tripFor(session.userId, id);
    return {
      success: true as const,
      data: await previewActivityDeletion(mongoose.connection.db!, session.userId, tripId, body),
    };
  }
);
export const writeWebActivityDeletion = withLedgerAuth(
  async (session, id: string, body: unknown) => {
    const tripId = await tripFor(session.userId, id);
    return {
      success: true as const,
      data: await deleteActivities(mongoose.connection.db!, session.userId, tripId, body),
    };
  }
);
export const lookupWebActivityDeletion = withLedgerAuth(
  async (session, id: string, uuid: string) => {
    const tripId = await tripFor(session.userId, id);
    return {
      success: true as const,
      data: await readActivityDeletion(
        mongoose.connection.db!,
        session.userId,
        tripId,
        clientRequestIdSchema.parse(uuid)
      ),
    };
  }
);
