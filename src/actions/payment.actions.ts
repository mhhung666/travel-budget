'use server';

import { revalidatePath } from 'next/cache';
import { Payment, Trip } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { recordPaymentSchema, type RecordPaymentInput } from '@/lib/validation';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { PaymentRecord } from '@/types';
import { logger } from '@/lib/logger';
import { toPaymentRecord, type PaymentDtoInput } from '@/lib/dto';
import { notify } from '@/lib/notify';

/**
 * 登記一筆還款（標記「已付清」）。任何成員皆可登記，與支出同樣的協作信任模型。
 * 金額存基準幣 TWD，結算時由 getSettlement 淨額抵銷。
 */
export const recordPayment = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: RecordPaymentInput
  ): Promise<ActionResult<PaymentRecord>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = recordPaymentSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { from_id, to_id, amount, note } = validation.data;
      const { tripId } = membership;

      // 付款人與收款人都必須是本旅程成員
      const trip = await Trip.findById(tripId).select('members').lean<{
        members: { user: { toString(): string } }[];
      }>();
      const memberIds = new Set((trip?.members || []).map((m) => m.user.toString()));
      if (!memberIds.has(from_id) || !memberIds.has(to_id)) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const created = await Payment.create({
        trip: tripId,
        from: from_id,
        to: to_id,
        amount,
        note: note ?? '',
        createdBy: session.userId,
      });

      await created.populate([
        { path: 'from', select: 'username displayName' },
        { path: 'to', select: 'username displayName' },
      ]);

      // 通知還款雙方（除觸發者外）「有人登記了與你有關的還款」
      await notify({
        tripId,
        actorId: session.userId,
        type: 'payment_recorded',
        meta: { payment_id: created._id.toString(), amount },
        recipientIds: [from_id, to_id],
      });

      revalidatePath(`/trips/${tripIdOrCode}/settlement`);
      return {
        success: true,
        data: toPaymentRecord(created.toObject() as unknown as PaymentDtoInput),
      };
    } catch (error) {
      logger.error('Record payment error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 刪除一筆還款紀錄。任何成員皆可刪除（與 deleteExpense 一致的信任模型）。
 */
export const deletePayment = withAuth(
  async (
    session,
    tripIdOrCode: string,
    paymentId: string
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      await Payment.deleteOne({ _id: paymentId, trip: membership.tripId });

      revalidatePath(`/trips/${tripIdOrCode}/settlement`);
      return { success: true, data: { message: '還款紀錄已刪除' } };
    } catch (error) {
      logger.error('Delete payment error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
