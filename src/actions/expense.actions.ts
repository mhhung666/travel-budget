'use server';

import { revalidatePath } from 'next/cache';
import { Expense, Trip, ItineraryDay, Comment, EXPENSE_CATEGORIES } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import {
  createExpenseSchema,
  updateExpenseSchema,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from '@/lib/validation';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { Expense as ExpenseDto } from '@/types';
import { logger } from '@/lib/logger';
import { toExpenseDto, type ExpenseDtoInput } from '@/lib/dto';
import { isReceiptKeyForTrip, RECEIPT_CONTENT_TYPES, MAX_RECEIPT_BYTES } from '@/lib/uploads';
import { headObject, deleteObjects, presignGet } from '@/lib/storage';
import { notify } from '@/lib/notify';
import { logActivity } from '@/lib/activity';

type LeanExpense = ExpenseDtoInput & { date: Date };

/**
 * Whether split shares (TWD) add up to the expense amount, within a generous
 * tolerance (1 TWD or 1%). The client form balances splits exactly; this guard
 * only rejects a grossly malformed payload (e.g. a buggy/tampered client).
 */
function splitsMatchAmount(splits: { share_amount: number }[], amount: number): boolean {
  const sum = splits.reduce((acc, sp) => acc + sp.share_amount, 0);
  return Math.abs(sum - amount) <= Math.max(1, amount * 0.01);
}

/**
 * 驗證關聯行程日（可複選）全部屬於本 trip——比照 payer/split 須為本 trip 成員的歸屬
 * 檢查，防止把支出指向別團的行程日。空/undefined（不關聯）一律通過。去重後以單一
 * countDocuments 比對數量，避免逐筆查詢。
 */
async function itineraryDaysBelongToTrip(
  tripId: string,
  dayIds: string[] | null | undefined
): Promise<boolean> {
  const unique = [...new Set(dayIds ?? [])];
  if (unique.length === 0) return true;
  const count = await ItineraryDay.countDocuments({ _id: { $in: unique }, trip: tripId });
  return count === unique.length;
}

type AttachmentDoc = {
  key: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
};

/**
 * Verify client-supplied receipt references and turn them into embedded
 * attachment docs. Each key must live under this trip's receipt prefix and the
 * object must actually exist in R2; size/contentType come from the verified
 * HeadObject (not the client-declared values) and are re-checked against the
 * caps/allowlist. Returns null if any reference is invalid (caller maps that to
 * VALIDATION_ERROR).
 */
async function resolveAttachments(
  tripId: string,
  uploaderId: string,
  inputs: { key: string }[]
): Promise<AttachmentDoc[] | null> {
  const docs: AttachmentDoc[] = [];
  for (const input of inputs) {
    if (!isReceiptKeyForTrip(tripId, input.key)) return null;
    const head = await headObject('receipts', input.key);
    if (!head) return null;
    if (head.size > MAX_RECEIPT_BYTES) return null;
    if (!(RECEIPT_CONTENT_TYPES as readonly string[]).includes(head.contentType)) return null;
    docs.push({
      key: input.key,
      contentType: head.contentType,
      size: head.size,
      uploadedBy: uploaderId,
      uploadedAt: new Date(),
    });
  }
  return docs;
}

/**
 * Get all expenses for a trip
 */
export const getExpenses = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<ExpenseDto[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const { tripId } = membership;

      // splits 已內嵌，payer 與 splits.user 一次 populate，徹底消除原本的 N+1
      const expenses = await Expense.find({ trip: tripId })
        .sort({ date: -1, createdAt: -1 })
        .populate('payer', 'username displayName')
        .populate('splits.user', 'username displayName')
        .lean<LeanExpense[]>();

      const data = expenses.map((e) => toExpenseDto(e, tripId));
      return { success: true, data };
    } catch (error) {
      logger.error('Get expenses error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Create a new expense
 */
export const createExpense = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: CreateExpenseInput
  ): Promise<ActionResult<ExpenseDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const { tripId } = membership;

      const validation = createExpenseSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const {
        payer_id,
        original_amount,
        currency,
        exchange_rate,
        description,
        category,
        date,
        splits,
        attachments,
        itinerary_day_ids,
        tags,
      } = validation.data;

      const amount = original_amount * exchange_rate;

      // Validate payer and split members are trip members
      const trip = await Trip.findById(tripId).select('members').lean<{
        members: { user: { toString(): string } }[];
      }>();
      const memberIds = new Set((trip?.members || []).map((m) => m.user.toString()));

      if (!memberIds.has(payer_id)) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }
      for (const split of splits) {
        if (!memberIds.has(split.user_id)) {
          return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
        }
      }

      // Defence-in-depth: split shares (TWD) must add up to the expense amount.
      // The form already balances them; this only rejects a grossly malformed
      // client payload (tolerance is generous to never trip on float rounding).
      if (!splitsMatchAmount(splits, amount)) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      // 關聯行程日（可複選，若有）須全部屬本 trip
      if (!(await itineraryDaysBelongToTrip(tripId, itinerary_day_ids))) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      // 驗證並轉換收據附件（key 須屬本 trip、物件須存在、size/type 以 headObject 為準）
      let attachmentDocs: AttachmentDoc[] = [];
      if (attachments && attachments.length > 0) {
        const resolved = await resolveAttachments(tripId, session.userId, attachments);
        if (!resolved) {
          return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
        }
        attachmentDocs = resolved;
      }

      const created = await Expense.create({
        trip: tripId,
        payer: payer_id,
        amount,
        originalAmount: original_amount,
        currency,
        exchangeRate: exchange_rate,
        description,
        category: category as (typeof EXPENSE_CATEGORIES)[number],
        date: new Date(date),
        splits: splits.map((s) => ({ user: s.user_id, shareAmount: s.share_amount })),
        attachments: attachmentDocs,
        itineraryDays: [...new Set(itinerary_day_ids ?? [])],
        createdBy: session.userId,
        tags: [...new Set(tags ?? [])],
      });

      await created.populate([
        { path: 'payer', select: 'username displayName' },
        { path: 'splits.user', select: 'username displayName' },
      ]);

      // 通知其他成員「有人新增支出」（best-effort，失敗不影響建立）
      await notify({
        tripId,
        actorId: session.userId,
        type: 'expense_added',
        meta: { expense_id: created._id.toString(), description, amount },
      });
      // 動態牆紀錄（含觸發者本人；best-effort）
      await logActivity({
        tripId,
        actorId: session.userId,
        type: 'expense_added',
        meta: { expense_id: created._id.toString(), description, amount },
      });

      revalidatePath(`/trips/${tripIdOrCode}/expenses`);
      return {
        success: true,
        data: toExpenseDto(created.toObject() as unknown as LeanExpense, tripId),
      };
    } catch (error) {
      logger.error('Create expense error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Update an expense
 */
export const updateExpense = withAuth(
  async (
    session,
    tripIdOrCode: string,
    expenseId: string,
    input: UpdateExpenseInput
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const { tripId } = membership;

      const validation = updateExpenseSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const {
        original_amount,
        currency,
        exchange_rate,
        description,
        category,
        payer_id,
        date,
        splits,
        attachments,
        itinerary_day_ids,
        tags,
      } = validation.data;

      // 讀取目前值（同時作為 existence check）
      const current = await Expense.findOne({ _id: expenseId, trip: tripId })
        .select('originalAmount exchangeRate description splits attachments')
        .lean<{
          originalAmount: number;
          exchangeRate: number;
          description: string;
          splits: { user: { toString(): string }; shareAmount: number }[];
          attachments?: {
            key: string;
            contentType: string;
            size: number;
            uploadedBy: { toString(): string };
            uploadedAt: Date;
          }[];
        }>();

      if (!current) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      // Updates must preserve the same trip-member boundary as creation. Without
      // this check, a client that knows an outside user id could replace the payer
      // or a split participant after the expense was created.
      if (payer_id !== undefined || splits !== undefined) {
        const trip = await Trip.findById(tripId).select('members').lean<{
          members: { user: { toString(): string } }[];
        }>();
        const memberIds = new Set((trip?.members ?? []).map((member) => member.user.toString()));
        if (
          (payer_id !== undefined && !memberIds.has(payer_id)) ||
          splits?.some((split) => !memberIds.has(split.user_id))
        ) {
          return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
        }
      }

      const set: Record<string, unknown> = {};
      if (description !== undefined) set.description = description.trim();
      if (original_amount !== undefined) set.originalAmount = original_amount;
      if (currency !== undefined) set.currency = currency;
      if (exchange_rate !== undefined) set.exchangeRate = exchange_rate;
      if (category !== undefined) set.category = category;
      if (payer_id !== undefined) set.payer = payer_id;
      if (date !== undefined) set.date = new Date(date);

      // 關聯行程日（可複選）：欄位出現才處理；傳空陣列可清除關聯，傳的 id 須全屬本 trip。
      if (itinerary_day_ids !== undefined) {
        if (!(await itineraryDaysBelongToTrip(tripId, itinerary_day_ids))) {
          return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
        }
        set.itineraryDays = [...new Set(itinerary_day_ids)];
      }

      // 自訂標籤：欄位出現才處理；傳空陣列可清除標籤。
      if (tags !== undefined) {
        set.tags = [...new Set(tags)];
      }

      // Recalculate TWD amount if needed
      let newAmount: number | undefined;
      if (original_amount !== undefined || exchange_rate !== undefined) {
        const oa = original_amount ?? current.originalAmount;
        const er = exchange_rate ?? current.exchangeRate;
        newAmount = oa * er;
        set.amount = newAmount;
      }

      if (splits !== undefined) {
        // Validate against the effective amount (recomputed if amount/rate changed,
        // otherwise the expense's current amount). See splitsMatchAmount.
        const effectiveAmount = newAmount ?? current.originalAmount * current.exchangeRate;
        if (!splitsMatchAmount(splits, effectiveAmount)) {
          return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
        }
        set.splits = splits.map((s) => ({ user: s.user_id, shareAmount: s.share_amount }));
      } else if (newAmount !== undefined && current.splits.length > 0) {
        // 金額改變但未提供 splits：依人數平均重算
        const share = newAmount / current.splits.length;
        set.splits = current.splits.map((s) => ({ user: s.user, shareAmount: share }));
      }

      // 收據附件：保留既有（含 uploadedBy/At）、只驗證並附加新的、移除被拿掉的
      if (attachments !== undefined) {
        const currentByKey = new Map((current.attachments ?? []).map((a) => [a.key, a]));
        const nextKeys = new Set(attachments.map((a) => a.key));
        const removed = [...currentByKey.keys()].filter((k) => !nextKeys.has(k));
        const newInputs = attachments.filter((a) => !currentByKey.has(a.key));

        const resolvedNew = await resolveAttachments(tripId, session.userId, newInputs);
        if (!resolvedNew) {
          return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
        }
        const kept = attachments
          .filter((a) => currentByKey.has(a.key))
          .map((a) => currentByKey.get(a.key)!);
        set.attachments = [...kept, ...resolvedNew];

        if (removed.length > 0) {
          // best-effort：刪不掉孤兒物件不該擋住使用者更新
          await deleteObjects('receipts', removed).catch((e) =>
            logger.error('Update expense: receipt cleanup failed', e)
          );
        }
      }

      await Expense.updateOne({ _id: expenseId, trip: tripId }, { $set: set });

      // 動態牆紀錄（描述取更新後的有效值；best-effort）
      await logActivity({
        tripId,
        actorId: session.userId,
        type: 'expense_updated',
        meta: {
          expense_id: expenseId,
          description: description !== undefined ? description.trim() : current.description,
        },
      });

      revalidatePath(`/trips/${tripIdOrCode}/expenses`);
      return { success: true, data: { message: '支出已更新' } };
    } catch (error) {
      logger.error('Update expense error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Delete an expense
 */
export const deleteExpense = withAuth(
  async (
    session,
    tripIdOrCode: string,
    expenseId: string
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      // 先讀附件 key（刪 R2 物件用）+ 描述（動態牆顯示用）
      const doc = await Expense.findOne({ _id: expenseId, trip: membership.tripId })
        .select('attachments description')
        .lean<{ attachments?: { key: string }[]; description?: string }>();

      await Expense.deleteOne({ _id: expenseId, trip: membership.tripId });

      const keys = (doc?.attachments ?? []).map((a) => a.key);
      if (keys.length > 0) {
        // best-effort：孤兒收據刪不掉不該擋住刪除支出
        await deleteObjects('receipts', keys).catch((e) =>
          logger.error('Delete expense: receipt cleanup failed', e)
        );
      }

      // MongoDB 無 FK cascade：手動清掉此支出下的留言（best-effort）
      await Comment.deleteMany({ expense: expenseId }).catch((e) =>
        logger.error('Delete expense: comment cleanup failed', e)
      );

      // 動態牆紀錄（支出已刪，描述取自刪除前的快照；best-effort）
      await logActivity({
        tripId: membership.tripId,
        actorId: session.userId,
        type: 'expense_deleted',
        meta: { description: doc?.description ?? '' },
      });

      revalidatePath(`/trips/${tripIdOrCode}/expenses`);
      return { success: true, data: { message: '支出已刪除' } };
    } catch (error) {
      logger.error('Delete expense error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Sign a short-lived GET URL for a receipt. Membership-gated, and the key must
 * belong to this trip — so a member of one trip can't sign another trip's
 * receipt even if they learn its key.
 */
export const getReceiptUrl = withAuth(
  async (session, tripIdOrCode: string, key: string): Promise<ActionResult<{ url: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (!isReceiptKeyForTrip(membership.tripId, key)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const url = await presignGet('receipts', key);
      return { success: true, data: { url } };
    } catch (error) {
      logger.error('getReceiptUrl error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
