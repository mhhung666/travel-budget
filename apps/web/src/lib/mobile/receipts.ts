import mongoose from 'mongoose';
import { receiptList, receiptView, ReceiptReadError } from '@/lib/receiptRead';
import { requireTripMember } from './access';
import { ApiError } from './http';
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
