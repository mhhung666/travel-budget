'use server';

import { revalidatePath } from 'next/cache';
import { Payment, Trip, Expense, User } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { recordPaymentSchema, type RecordPaymentInput } from '@/lib/validation';
import { calculateSettlement, applyPayments } from '@/lib/settlement';
import { getResendConfig } from '@/lib/env';
import { sendEmail } from '@/lib/email';
import { buildPaymentReminderEmail } from '@/lib/emailTemplates';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { PaymentRecord } from '@/types';
import { logger } from '@/lib/logger';
import { toPaymentRecord, type PaymentDtoInput } from '@/lib/dto';
import { notify } from '@/lib/notify';
import { logActivity } from '@/lib/activity';

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
      // 動態牆紀錄（含觸發者本人；best-effort）
      await logActivity({
        tripId,
        actorId: session.userId,
        type: 'payment_recorded',
        meta: { payment_id: created._id.toString(), amount },
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

type LeanExpenseForReminder = {
  payer: { toString(): string };
  amount: number;
  splits: { user: { toString(): string }; shareAmount: number }[];
};

/**
 * 「提醒還款」：由結算頁的債權人（被欠款者）手動觸發，對某位欠他款的成員（債務人）
 * 即時寄出一封提醒 Email。取代原本的每日/每週結算提醒 cron——改由使用者主動催款。
 *
 * 安全：伺服端**重算結算**確認「`debtorId` → 觸發者」確有一筆建議轉帳才寄信
 * （不信任前端帶的金額／對象），避免被拿來騷擾無欠款的成員。
 */
export const remindPayment = withAuth(
  async (
    session,
    tripIdOrCode: string,
    debtorId: string
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const { tripId } = membership;
      const creditorId = session.userId;
      if (debtorId === creditorId) {
        return { success: false, error: 'remindFailedNotOwed', code: 'VALIDATION_ERROR' };
      }

      // 一次取成員 + 支出 + 還款，記憶體中重算結算（比照 getSettlement）
      const [trip, expenses, paymentDocs] = await Promise.all([
        Trip.findById(tripId).select('name hashCode members').lean<{
          name: string;
          hashCode: string;
          members: { user: { toString(): string } }[];
        } | null>(),
        Expense.find({ trip: tripId })
          .select('payer amount splits')
          .lean<LeanExpenseForReminder[]>(),
        Payment.find({ trip: tripId })
          .select('from to amount')
          .lean<{ from: { toString(): string }; to: { toString(): string }; amount: number }[]>(),
      ]);
      if (!trip) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const memberIds = trip.members.map((m) => m.user.toString());
      if (!memberIds.includes(debtorId)) {
        return { success: false, error: 'remindFailedNotOwed', code: 'VALIDATION_ERROR' };
      }

      const paidByUser = new Map<string, number>();
      const owedByUser = new Map<string, number>();
      for (const e of expenses) {
        paidByUser.set(
          e.payer.toString(),
          (paidByUser.get(e.payer.toString()) || 0) + (e.amount || 0)
        );
        for (const s of e.splits || []) {
          const uid = s.user.toString();
          owedByUser.set(uid, (owedByUser.get(uid) || 0) + (s.shareAmount || 0));
        }
      }
      const expenseBalances = memberIds.map((id) => ({
        userId: id,
        balance: (paidByUser.get(id) || 0) - (owedByUser.get(id) || 0),
      }));
      const balances = applyPayments(
        expenseBalances,
        paymentDocs.map((p) => ({ from: p.from.toString(), to: p.to.toString(), amount: p.amount }))
      );
      // calculateSettlement 以 `username` 作 from/to 標籤——傳入 userId 即可取得「以 id 標示」
      // 的建議轉帳，便於精確比對債務人/債權人，不受同名影響。
      const transactions = calculateSettlement(
        balances.map((b) => ({ userId: b.userId, username: b.userId, balance: b.balance }))
      );
      const owed = transactions.find((t) => t.from === debtorId && t.to === creditorId);
      if (!owed) {
        return { success: false, error: 'remindFailedNotOwed', code: 'VALIDATION_ERROR' };
      }

      // Resend 未配置時無法寄信
      const resend = getResendConfig();
      if (!resend) {
        return { success: false, error: 'remindFailed', code: 'INTERNAL_ERROR' };
      }

      // 取債務人收件資訊 + 觸發者顯示名
      const [debtor, creditor] = await Promise.all([
        User.findById(debtorId).select('email notifyByEmail locale isVirtual').lean<{
          email?: string | null;
          notifyByEmail?: boolean | null;
          locale?: string | null;
          isVirtual?: boolean | null;
        } | null>(),
        User.findById(creditorId).select('displayName').lean<{ displayName: string } | null>(),
      ]);

      // 虛擬成員無法登入、未設信箱、或已關閉 Email 通知 → 無法提醒
      if (!debtor || debtor.isVirtual || !debtor.email || debtor.notifyByEmail === false) {
        return { success: false, error: 'remindFailedNoEmail', code: 'VALIDATION_ERROR' };
      }

      const content = await buildPaymentReminderEmail({
        locale: debtor.locale ?? 'zh',
        appUrl: resend.appUrl,
        actorName: creditor?.displayName ?? '',
        tripHashCode: trip.hashCode,
        tripName: trip.name,
        amount: owed.amount,
      });
      const sent = await sendEmail({ to: debtor.email, content });
      if (!sent) {
        return { success: false, error: 'remindFailed', code: 'INTERNAL_ERROR' };
      }

      return { success: true, data: { message: 'reminderSent' } };
    } catch (error) {
      logger.error('Remind payment error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
