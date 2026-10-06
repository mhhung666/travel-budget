import mongoose from 'mongoose';
import { expenseUpdateInput, expenseDeleteInput, idSchema } from '@travel-budget/contracts';
import { getEnv } from '@/lib/env';
import { maintainExpense, readExpenseEditContext } from '@/lib/expenseMaintenance';
import { TripEntryError } from '@/lib/tripEntry';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { ApiError, readBody } from './http';
import { requireTripMember } from './access';
import { tripEntryError } from './tripEntry';
function mapError(error: unknown): unknown {
  if (error instanceof TripWriteError && ['FORBIDDEN', 'NOT_FOUND'].includes(error.code))
    return new ApiError(404, 'NOT_FOUND');
  if (
    error instanceof TripEntryError &&
    ['RESOURCE_CHANGED', 'RESOURCE_GONE', 'VALIDATION_ERROR'].includes(error.code)
  )
    return new ApiError(409, error.code);
  return tripEntryError(error);
}
export async function mobileEditContext(actorId: string, id: string, expenseId: string) {
  const tripId = await requireTripMember(actorId, id);
  if (!idSchema.safeParse(expenseId).success) throw new ApiError(404, 'NOT_FOUND');
  try {
    return await readExpenseEditContext(
      mongoose.connection.db!,
      actorId,
      tripId,
      expenseId,
      getEnv().JWT_SECRET
    );
  } catch (error) {
    if (error instanceof TripEntryError && error.code === 'NOT_FOUND')
      throw new ApiError(404, 'RESOURCE_GONE');
    throw mapError(error);
  }
}
export async function mobileMaintainExpense(
  request: Request,
  actorId: string,
  id: string,
  expenseId: string,
  operation: 'expense.update' | 'expense.delete'
) {
  const tripId = await requireTripMember(actorId, id);
  if (!idSchema.safeParse(expenseId).success) throw new ApiError(404, 'NOT_FOUND');
  const body =
    operation === 'expense.update'
      ? await readBody(request, expenseUpdateInput)
      : await readBody(request, expenseDeleteInput);
  try {
    return await maintainExpense(
      mongoose.connection.db!,
      actorId,
      tripId,
      expenseId,
      operation,
      body,
      getEnv().JWT_SECRET
    );
  } catch (error) {
    throw mapError(error);
  }
}
