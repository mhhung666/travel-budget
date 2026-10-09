import { z } from 'zod';
import { idSchema, receiptWriteInput, receiptWriteCommand } from '@travel-budget/contracts';
import {
  beginReceiptWrite,
  commandReceiptWrite,
  receiptWriteStatus,
  ReceiptWriteError,
} from '@/lib/receiptWrite';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import mongoose from 'mongoose';
import { receiptList, receiptView, ReceiptReadError } from '@/lib/receiptRead';
import { requireTripMember } from './access';
import { ApiError, readBody } from './http';
export async function mobileReceipts(
  user: string,
  trip: string,
  expense: string,
  attachment?: string
) {
  await requireTripMember(user, trip);
  try {
    return attachment === undefined
      ? await receiptList(mongoose.connection.db!, user, trip, expense)
      : await receiptView(mongoose.connection.db!, user, trip, expense, attachment);
  } catch (error) {
    if (error instanceof ReceiptReadError)
      throw new ApiError(error.code === 'ATTACHMENT_DATA_INVALID' ? 503 : 404, error.code);
    throw error;
  }
}

export async function mobileReceiptWrite(
  request: Request,
  user: string,
  trip: string,
  expense: string,
  uuid?: string
) {
  await requireTripMember(user, trip);
  if (!idSchema.safeParse(expense).success || (uuid && !z.uuid().safeParse(uuid).success))
    throw new ApiError(400, 'VALIDATION_ERROR');
  try {
    const db = mongoose.connection.db!;
    if (!uuid)
      return await beginReceiptWrite(
        db,
        user,
        trip,
        expense,
        await readBody(request, receiptWriteInput)
      );
    if (request.method === 'GET') return await receiptWriteStatus(db, user, trip, expense, uuid);
    const command = await readBody(request, receiptWriteCommand);
    return await commandReceiptWrite(db, user, trip, expense, uuid, command.action);
  } catch (error) {
    if (error instanceof ReceiptWriteError)
      throw new ApiError(error.code === 'REQUEST_NOT_FOUND' ? 404 : 409, error.code);
    if (error instanceof TripWriteError) throw new ApiError(404, 'NOT_FOUND');
    throw error;
  }
}
