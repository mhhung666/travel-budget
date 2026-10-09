import mongoose from 'mongoose';
import { ExpenseSearchChanged, parseExpenseSearch, readExpenseSearch } from '@/lib/expenseSearch';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { requireTripMember } from './access';
import { ApiError } from './http';
import { tripEntryError } from './tripEntry';
export async function mobileExpenseSearch(userId: string, id: string, url: URL) {
  const tripId = await requireTripMember(userId, id);
  let input;
  try {
    input = parseExpenseSearch(url);
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR');
  }
  try {
    return await readExpenseSearch(mongoose.connection.db!, userId, tripId, input);
  } catch (error) {
    if (error instanceof ExpenseSearchChanged) throw new ApiError(409, 'RESOURCE_CHANGED');
    if (error instanceof TripWriteError) throw new ApiError(404, 'NOT_FOUND');
    throw tripEntryError(error);
  }
}
