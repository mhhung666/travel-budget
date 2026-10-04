'use server';

import {
  assertBlobsAvailable,
  retireUnreferencedBlobs,
  RetiredBlobError,
} from '@/lib/blobReferences';
import { allocateMoney, roundMoney } from '@/lib/money';
import { cleanupRetiredBlobs } from '@/lib/blobCleanup';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import mongoose from 'mongoose';
import {
  allocateShares,
  createExpenseForActor,
  itineraryDaysBelongToTrip,
  resolveAttachments,
  splitsMatchAmount,
} from '@/lib/expenseCreate';
import { withTripWrite, TripWriteError } from '@/lib/tripWriteTransaction';
import { Expense, Trip, Comment } from '@/models';
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
import { isReceiptKeyForTrip } from '@/lib/uploads';
import { presignGet } from '@/lib/storage';
import { logActivity } from '@/lib/activity';

type LeanExpense = ExpenseDtoInput & { date: Date };

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

/** Lightweight autocomplete metadata for the expense form. */
export const getExpenseTags = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<string[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const tags = await Expense.distinct('tags', { trip: membership.tripId });
      return {
        success: true,
        data: tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0).sort(),
      };
    } catch (error) {
      logger.error('Get expense tags error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Create a new expense. This is the cookie adapter: it authenticates, resolves the trip, parses the
 * input and owns Next.js cache invalidation. The write itself lives in `lib/expenseCreate.ts`,
 * shared with the native HTTP API.
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

      const created = await createExpenseForActor(
        { tripId, actorId: session.userId, input: validation.data },
        (task) => after(task)
      );
      if (created.replayed) return { success: true, data: created.data };
      try {
        revalidatePath(`/trips/${tripIdOrCode}/expenses`);
      } catch {
        // The expense is committed; a cache failure must not be reported as a failed creation.
        logger.error('Create expense cache invalidation failed');
      }
      return { success: true, data: created.data };
    } catch (error) {
      if (error instanceof RetiredBlobError)
        return { success: false, error: error.code, code: error.code };
      if (error instanceof TripWriteError)
        return { success: false, error: error.code, code: error.code };
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
      const snapshot = await Expense.findOne({ _id: expenseId, trip: tripId })
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

      if (!snapshot) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const initialKeys = new Set((snapshot.attachments ?? []).map((a) => a.key));
      const verified =
        attachments === undefined
          ? []
          : await resolveAttachments(
              tripId,
              session.userId,
              attachments.filter((a) => !initialKeys.has(a.key))
            );
      if (!verified) return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      const { current, removed } = await withTripWrite(
        tripId,
        session.userId,
        async (transactionSession) => {
          // 讀取目前值（同時作為 existence check）
          const current = await Expense.findOne({ _id: expenseId, trip: tripId })
            .session(transactionSession)
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
            throw new TripWriteError('NOT_FOUND');
          }

          // Updates must preserve the same trip-member boundary as creation. Without
          // this check, a client that knows an outside user id could replace the payer
          // or a split participant after the expense was created.
          if (payer_id !== undefined || splits !== undefined) {
            const trip = await Trip.findById(tripId)
              .session(transactionSession)
              .select('members')
              .lean<{
                members: { user: { toString(): string } }[];
              }>();
            const memberIds = new Set(
              (trip?.members ?? []).map((member) => member.user.toString())
            );
            if (
              (payer_id !== undefined && !memberIds.has(payer_id)) ||
              splits?.some((split) => !memberIds.has(split.user_id))
            ) {
              throw new TripWriteError('VALIDATION_ERROR');
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
            if (!(await itineraryDaysBelongToTrip(tripId, itinerary_day_ids, transactionSession))) {
              throw new TripWriteError('VALIDATION_ERROR');
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
            newAmount = roundMoney(oa * er);
            set.amount = newAmount;
          }

          if (splits !== undefined) {
            // Validate against the effective amount (recomputed if amount/rate changed,
            // otherwise the expense's current amount). See splitsMatchAmount.
            const effectiveAmount =
              newAmount ?? roundMoney(current.originalAmount * current.exchangeRate);
            if (!splitsMatchAmount(splits, effectiveAmount)) {
              throw new TripWriteError('VALIDATION_ERROR');
            }
            const shareAmounts = allocateShares(splits, effectiveAmount);
            set.splits = splits.map((s, i) => ({
              user: s.user_id,
              shareAmount: shareAmounts[i],
            }));
          } else if (newAmount !== undefined && current.splits.length > 0) {
            // 金額改變但未提供 splits：依人數平均重算；尾差要分配掉，否則加總會少於金額
            const shares = allocateMoney(
              newAmount,
              current.splits.map(() => 1)
            );
            set.splits = current.splits.map((s, i) => ({ user: s.user, shareAmount: shares[i] }));
          }

          let removed: string[] = [];
          if (attachments !== undefined) {
            const currentByKey = new Map((current.attachments ?? []).map((a) => [a.key, a]));
            const verifiedByKey = new Map(verified.map((a) => [a.key, a]));
            const nextKeys = new Set(attachments.map((a) => a.key));
            removed = [...currentByKey.keys()].filter((key) => !nextKeys.has(key));
            set.attachments = attachments.map((a) => {
              const value = currentByKey.get(a.key) ?? verifiedByKey.get(a.key);
              if (!value) throw new TripWriteError('CONFLICT');
              return value;
            });
          }

          if (attachments)
            await assertBlobsAvailable(
              mongoose.connection.db!,
              transactionSession,
              attachments.map((a) => a.key)
            );
          await Expense.updateOne(
            { _id: expenseId, trip: tripId },
            { $set: set },
            { session: transactionSession }
          );

          await retireUnreferencedBlobs(
            mongoose.connection.db!,
            transactionSession,
            tripId,
            removed
          );
          return { current, removed };
        }
      );
      await cleanupRetiredBlobs(mongoose.connection.db!, removed);

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
      if (error instanceof RetiredBlobError)
        return { success: false, error: error.code, code: error.code };
      if (error instanceof TripWriteError)
        return { success: false, error: error.code, code: error.code };
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

      const doc = await withTripWrite(
        membership.tripId,
        session.userId,
        async (transactionSession) => {
          // 先讀附件 key（刪 R2 物件用）+ 描述（動態牆顯示用）
          const doc = await Expense.findOne({ _id: expenseId, trip: membership.tripId })
            .session(transactionSession)
            .select('attachments description')
            .lean<{ attachments?: { key: string }[]; description?: string }>();

          await Expense.deleteOne(
            { _id: expenseId, trip: membership.tripId },
            { session: transactionSession }
          );

          await Comment.deleteMany(
            { expense: expenseId, trip: membership.tripId },
            { session: transactionSession }
          );
          await retireUnreferencedBlobs(
            mongoose.connection.db!,
            transactionSession,
            membership.tripId,
            (doc?.attachments ?? []).map((a) => a.key)
          );
          return doc;
        }
      );

      const keys = (doc?.attachments ?? []).map((a) => a.key);
      await cleanupRetiredBlobs(mongoose.connection.db!, keys);

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
      if (error instanceof TripWriteError)
        return { success: false, error: error.code, code: error.code };
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
