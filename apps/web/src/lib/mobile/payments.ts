import mongoose from 'mongoose';
import { idSchema, paymentCreateInput, paymentDeleteInput } from '@travel-budget/contracts';
import { getEnv } from '@/lib/env';
import { readPaymentContext, readPaymentRevokeContext, writePayment } from '@/lib/paymentWrite';
import { TripEntryError } from '@/lib/tripEntry';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { deliverPaymentNotification } from '@/lib/notify';
import { ApiError, readBody } from './http';
import { requireTripMember } from './access';
import { tripEntryError } from './tripEntry';
function mapError(error: unknown): unknown {
  if (error instanceof TripWriteError && ['FORBIDDEN', 'NOT_FOUND'].includes(error.code))
    return new ApiError(404, 'NOT_FOUND');
  if (
    error instanceof TripEntryError &&
    ['SETTLEMENT_CHANGED', 'RESOURCE_CHANGED', 'RESOURCE_GONE', 'VALIDATION_ERROR'].includes(
      error.code
    )
  )
    return new ApiError(409, error.code);
  return tripEntryError(error);
}
export async function mobilePaymentContext(actorId: string, id: string, paymentId?: string) {
  const tripId = await requireTripMember(actorId, id);
  if (paymentId !== undefined && !idSchema.safeParse(paymentId).success)
    throw new ApiError(404, 'NOT_FOUND');
  try {
    return paymentId === undefined
      ? await readPaymentContext(mongoose.connection.db!, actorId, tripId, getEnv().JWT_SECRET)
      : await readPaymentRevokeContext(
          mongoose.connection.db!,
          actorId,
          tripId,
          paymentId,
          getEnv().JWT_SECRET
        );
  } catch (error) {
    if (error instanceof TripEntryError && error.code === 'RESOURCE_GONE')
      throw new ApiError(404, 'RESOURCE_GONE');
    throw mapError(error);
  }
}
export async function mobileWritePayment(
  request: Request,
  actorId: string,
  id: string,
  paymentId?: string
) {
  const tripId = await requireTripMember(actorId, id);
  if (paymentId !== undefined && !idSchema.safeParse(paymentId).success)
    throw new ApiError(404, 'NOT_FOUND');
  const operation = paymentId === undefined ? 'payment.create' : 'payment.delete';
  const body =
    operation === 'payment.create'
      ? await readBody(request, paymentCreateInput)
      : await readBody(request, paymentDeleteInput);
  try {
    const { result } = await writePayment(
      mongoose.connection.db!,
      actorId,
      tripId,
      operation,
      body,
      getEnv().JWT_SECRET,
      paymentId,
      deliverPaymentNotification
    );
    return result;
  } catch (error) {
    throw mapError(error);
  }
}
