'use server';

import { revalidatePath } from 'next/cache';
import { ItineraryDay, Note, User } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import {
  createNoteSchema,
  updateNoteSchema,
  planNoteSchema,
  type CreateNoteInput,
  type UpdateNoteInput,
  type PlanNoteInput,
} from '@/lib/validation';
import type { ActionResult } from './types';
import type { TripNote } from '@/types';
import { withAuth } from './withAuth';
import { logger } from '@/lib/logger';
import { toTripNoteDto, type TripNoteDtoInput } from '@/lib/dto';

/**
 * 隨手記 actions。比照 Checklist 為旅程下的獨立子集合，採**成員信任模型**
 * （任何成員皆可建立/編輯/刪除/轉行程）——隨手記是最低摩擦的協作速記，
 * 卡權限反而失去「隨手」的意義。僅成員可讀：不設公開分享路由（分享頁看不到）。
 */

/** planNote 產生的活動標題上限（與 UI 顯示寬度取捨；全文放進活動備註）。 */
const PLAN_TITLE_MAX = 100;

/** 取得旅程的所有隨手記（釘選優先、新到舊——與列表索引同序）。 */
export const getNotes = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<TripNote[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const notes = await Note.find({ trip: membership.tripId })
        .sort({ pinned: -1, createdAt: -1 })
        .lean<TripNoteDtoInput[]>();

      return { success: true, data: notes.map(toTripNoteDto) };
    } catch (error) {
      logger.error('Get notes error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 新增一則隨手記。 */
export const createNote = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: CreateNoteInput
  ): Promise<ActionResult<TripNote>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = createNoteSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      // 去正規化作者名稱（事件當下快照，讀取免 populate，比照 comment.actions.ts）
      const author = await User.findById(session.userId)
        .select('displayName')
        .lean<{ displayName: string } | null>();

      const created = await Note.create({
        trip: membership.tripId,
        text: validation.data.text,
        createdBy: session.userId,
        authorName: author?.displayName ?? '',
      });

      revalidatePath(`/trips/${tripIdOrCode}/notes`);
      return {
        success: true,
        data: toTripNoteDto(created.toObject() as unknown as TripNoteDtoInput),
      };
    } catch (error) {
      logger.error('Create note error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 更新一則隨手記（改文字 / 釘選）。成員信任：不檢查作者，比照清單。 */
export const updateNote = withAuth(
  async (
    session,
    tripIdOrCode: string,
    noteId: string,
    input: UpdateNoteInput
  ): Promise<ActionResult<TripNote>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = updateNoteSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { text, pinned } = validation.data;
      const set: Record<string, unknown> = {};
      if (text !== undefined) set.text = text;
      if (pinned !== undefined) set.pinned = pinned;

      const updated = await Note.findOneAndUpdate(
        { _id: noteId, trip: membership.tripId },
        { $set: set },
        { new: true }
      ).lean<TripNoteDtoInput | null>();
      if (!updated) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      revalidatePath(`/trips/${tripIdOrCode}/notes`);
      return { success: true, data: toTripNoteDto(updated) };
    } catch (error) {
      logger.error('Update note error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 刪除一則隨手記。 */
export const deleteNote = withAuth(
  async (
    session,
    tripIdOrCode: string,
    noteId: string
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      await Note.deleteOne({ _id: noteId, trip: membership.tripId });

      revalidatePath(`/trips/${tripIdOrCode}/notes`);
      return { success: true, data: { message: '筆記已刪除' } };
    } catch (error) {
      logger.error('Delete note error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 把隨手記轉成某一行程日的活動，並把筆記標記為已規劃（保留在摺疊區，不可重複轉換）。
 *
 * 權限是**產品決定**：行程日本身的建立/編輯是 admin-only，但這裡開放全體成員——
 * 隨手記的定位就是「人人先丟點子、順手推進行程」，卡在 admin 會斷掉這條協作路徑。
 *
 * 非交易式（本 codebase 無多文件交易慣例）：先 $push 活動、再標記筆記；中途失敗
 * 筆記維持未規劃，重試可能產生重複活動（可手動刪），不會反向遺失資料。
 */
export const planNote = withAuth(
  async (
    session,
    tripIdOrCode: string,
    noteId: string,
    input: PlanNoteInput
  ): Promise<ActionResult<TripNote>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = planNoteSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const note = await Note.findOne({ _id: noteId, trip: membership.tripId })
        .select('text plannedAt')
        .lean<{ text: string; plannedAt: Date | null } | null>();
      if (!note) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (note.plannedAt) {
        return { success: false, error: '這則筆記已加入行程', code: 'VALIDATION_ERROR' };
      }

      // 首行截斷作標題；截斷或多行時全文進活動備註，避免資訊遺失
      const firstLine = note.text.split('\n', 1)[0].trim();
      const title = firstLine.slice(0, PLAN_TITLE_MAX);
      const truncated = title !== note.text.trim();

      const day = await ItineraryDay.findOneAndUpdate(
        { _id: validation.data.day_id, trip: membership.tripId },
        {
          $push: {
            activities: {
              time: null,
              endTime: null,
              title,
              type: 'other',
              location: null,
              note: truncated ? note.text : '',
              confirmationCode: '',
              attachments: [],
            },
          },
        }
      ).select('dayNumber');
      if (!day) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const updated = await Note.findOneAndUpdate(
        { _id: noteId, trip: membership.tripId },
        { $set: { plannedAt: new Date(), plannedDayNumber: day.dayNumber } },
        { new: true }
      ).lean<TripNoteDtoInput | null>();
      if (!updated) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      revalidatePath(`/trips/${tripIdOrCode}/notes`);
      revalidatePath(`/trips/${tripIdOrCode}/itinerary`);
      return { success: true, data: toTripNoteDto(updated) };
    } catch (error) {
      logger.error('Plan note error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
