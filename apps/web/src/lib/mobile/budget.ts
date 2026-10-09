import mongoose from 'mongoose';
import { budgetV2Input } from '@travel-budget/contracts';
import { readBudget } from '@/lib/budgetRead';
import { writeWebSettings } from '@/lib/webSettingsWrite';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { LedgerError } from '@/lib/ledger';
import { requireTripMember } from './access';
import { ApiError, readBody } from './http';
import { tripEntryError } from './tripEntry';
function mapError(error: unknown) {
  if (error instanceof TripWriteError) return new ApiError(404, 'NOT_FOUND');
  // A valid, frozen body can only hit this on a UUID collision with a different payload.
  if (error instanceof LedgerError && error.code === 'VALIDATION_ERROR')
    return new ApiError(409, 'IDEMPOTENCY_CONFLICT');
  return tripEntryError(error);
}
export async function mobileBudget(actorId: string, id: string) {
  const tripId = await requireTripMember(actorId, id);
  try {
    return await readBudget(mongoose.connection.db!, actorId, tripId);
  } catch (error) {
    throw mapError(error);
  }
}
export async function mobileSetBudget(request: Request, actorId: string, id: string) {
  const tripId = await requireTripMember(actorId, id);
  const input = await readBody(request, budgetV2Input);
  try {
    const terminal = await writeWebSettings(
      mongoose.connection.db!,
      actorId,
      tripId,
      'budget',
      input
    );
    if (terminal.status === 'rejected') throw new ApiError(409, terminal.code!);
    return terminal.result;
  } catch (error) {
    throw mapError(error);
  }
}
