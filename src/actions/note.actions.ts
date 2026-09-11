'use server';

import { withTripWrite, TripWriteError } from '@/lib/tripWriteTransaction';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { withNotePlanningTransaction, NotePlanningError } from '@/lib/notePlanningTransaction';
import { activityCapacityFilter } from '@/lib/itineraryLimits';
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
import { summarizeNote } from '@/lib/noteMarkdown';
import { withAuth } from './withAuth';
import { logger } from '@/lib/logger';
import { toTripNoteDto, type TripNoteDtoInput } from '@/lib/dto';
import { isNoteKeyForTrip, NOTE_CONTENT_TYPES, MAX_NOTE_BYTES } from '@/lib/uploads';
import { headObject, deleteObjects, presignGet } from '@/lib/storage';

/** 儲存用的照片附件 doc（內嵌於 Note）。 */
type NoteAttachmentDoc = {
  key: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
};

/**
 * 把照片附件輸入解析成儲存用 doc。已存在的 key（existingByKey）直接沿用（保留
 * uploadedBy/At）；新 key 以 **headObject** 驗證——須屬本 trip 的筆記前綴、物件須存在、
 * size/type 以實際物件為準核對白名單/上限（防 client 謊報）。任一參照無效回 null。
 * 比照 itinerary.actions 的 resolveActivityAttachments。
 */
async function resolveNoteAttachments(
  tripId: string,
  uploaderId: string,
  inputs: { key: string }[],
  existingByKey: Map<string, NoteAttachmentDoc>
): Promise<NoteAttachmentDoc[] | null> {
  const docs: NoteAttachmentDoc[] = [];
  for (const input of inputs) {
    const existing = existingByKey.get(input.key);
    if (existing) {
      docs.push(existing);
      continue;
    }
    if (!isNoteKeyForTrip(tripId, input.key)) return null;
    const head = await headObject('receipts', input.key);
    if (!head) return null;
    if (head.size > MAX_NOTE_BYTES) return null;
    if (!(NOTE_CONTENT_TYPES as readonly string[]).includes(head.contentType)) return null;
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

/** 現有附件 key → doc，作為覆寫時的 diff 基準（沿用舊 key、算出被移除的孤兒）。 */
function noteAttachmentsByKey(
  attachments: NoteAttachmentDoc[] | undefined
): Map<string, NoteAttachmentDoc> {
  const map = new Map<string, NoteAttachmentDoc>();
  for (const at of attachments ?? []) map.set(at.key, at);
  return map;
}

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

      // 照片附件：全為新 key，走 headObject 驗證（無現有可沿用）
      const attachments = await resolveNoteAttachments(
        membership.tripId,
        session.userId,
        validation.data.attachments ?? [],
        new Map()
      );
      if (!attachments) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const created = await withTripWrite(
        membership.tripId,
        session.userId,
        async (transactionSession) => {
          // 去正規化作者名稱（事件當下快照，讀取免 populate，比照 comment.actions.ts）
          const author = await User.findById(session.userId)
            .session(transactionSession)
            .select('displayName')
            .lean<{ displayName: string } | null>();

          const [created] = await Note.create(
            [
              {
                trip: membership.tripId,
                text: validation.data.text,
                createdBy: session.userId,
                authorName: author?.displayName ?? '',
                attachments,
              },
            ],
            { session: transactionSession }
          );

          return created;
        }
      );
      revalidatePath(`/trips/${tripIdOrCode}/notes`);
      return {
        success: true,
        data: toTripNoteDto(created.toObject() as unknown as TripNoteDtoInput),
      };
    } catch (error) {
      if (error instanceof TripWriteError)
        return { success: false, error: error.code, code: error.code };
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

      const { text, pinned, attachments } = validation.data;
      let verified: NoteAttachmentDoc[] | undefined;
      if (attachments !== undefined) {
        const initial = await Note.findOne({ _id: noteId, trip: membership.tripId })
          .select('attachments')
          .lean<{ attachments?: NoteAttachmentDoc[] } | null>();
        if (!initial) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
        const existing = noteAttachmentsByKey(initial.attachments ?? []);
        const resolved = await resolveNoteAttachments(
          membership.tripId,
          session.userId,
          attachments,
          existing
        );
        if (!resolved)
          return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
        verified = resolved.filter((a) => !existing.has(a.key));
      }
      const { updated, removedKeys } = await withTripWrite(
        membership.tripId,
        session.userId,
        async (transactionSession) => {
          const set: Record<string, unknown> = {};
          if (text !== undefined) set.text = text;
          if (pinned !== undefined) set.pinned = pinned;

          let removedKeys: string[] = [];
          if (attachments !== undefined) {
            const current = await Note.findOne({ _id: noteId, trip: membership.tripId })
              .session(transactionSession)
              .select('attachments')
              .lean<{ attachments?: NoteAttachmentDoc[] } | null>();
            if (!current) throw new TripWriteError('NOT_FOUND');
            const existing = noteAttachmentsByKey(current.attachments ?? []);
            const verifiedByKey = noteAttachmentsByKey(verified ?? []);
            set.attachments = attachments.map((a) => {
              const value = existing.get(a.key) ?? verifiedByKey.get(a.key);
              if (!value) throw new TripWriteError('CONFLICT');
              return value;
            });
            const nextKeys = new Set(attachments.map((a) => a.key));
            removedKeys = [...existing.keys()].filter((key) => !nextKeys.has(key));
          }
          const updated = await Note.findOneAndUpdate(
            { _id: noteId, trip: membership.tripId },
            { $set: set },
            { new: true, session: transactionSession }
          ).lean<TripNoteDtoInput | null>();
          if (!updated) {
            throw new TripWriteError('NOT_FOUND');
          }

          return { updated, removedKeys };
        }
      );
      if (removedKeys.length > 0) {
        // best-effort：孤兒照片刪不掉不該擋住更新
        await deleteObjects('receipts', removedKeys).catch((e) =>
          logger.error('Update note: attachment cleanup failed', e)
        );
      }

      revalidatePath(`/trips/${tripIdOrCode}/notes`);
      return { success: true, data: toTripNoteDto(updated) };
    } catch (error) {
      if (error instanceof TripWriteError)
        return { success: false, error: error.code, code: error.code };
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

      const doc = await withTripWrite(
        membership.tripId,
        session.userId,
        async (transactionSession) => {
          // 先讀附件 key 以便刪 R2 物件（attachments 內嵌，隨文件一併移除）
          const doc = await Note.findOne({ _id: noteId, trip: membership.tripId })
            .session(transactionSession)
            .select('attachments.key')
            .lean<{ attachments?: { key: string }[] } | null>();

          await Note.deleteOne(
            { _id: noteId, trip: membership.tripId },
            { session: transactionSession }
          );

          return doc;
        }
      );
      const keys = (doc?.attachments ?? []).map((a) => a.key);
      if (keys.length > 0) {
        // best-effort：孤兒照片刪不掉不該擋住刪除筆記
        await deleteObjects('receipts', keys).catch((e) =>
          logger.error('Delete note: attachment cleanup failed', e)
        );
      }

      revalidatePath(`/trips/${tripIdOrCode}/notes`);
      return { success: true, data: { message: '筆記已刪除' } };
    } catch (error) {
      if (error instanceof TripWriteError)
        return { success: false, error: error.code, code: error.code };
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
 * 交易內重新驗證成員並寫入 Trip fence，新增活動與標記筆記一起提交或回滾。
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

      await dbConnect();
      const updated = await withNotePlanningTransaction(
        mongoose.connection.db!,
        membership.tripId,
        session.userId,
        async (transactionSession) => {
          const note = await Note.findOne({ _id: noteId, trip: membership.tripId }, null, {
            session: transactionSession,
          })
            .select('text plannedAt')
            .lean<{ text: string; plannedAt: Date | null } | null>();
          if (!note) {
            throw new NotePlanningError('NOT_FOUND');
          }
          if (note.plannedAt) {
            throw new NotePlanningError('VALIDATION_ERROR');
          }

          // 首行去掉 Markdown 語法後截斷作標題（「# 東京美食」→「東京美食」）；
          // strip 不出內容（如整行只有圖片語法）退回原始首行。標題有截斷/改寫或
          // 筆記多行時，全文進活動備註，避免資訊遺失。
          const plainTitle = summarizeNote(note.text).title;
          const rawFirstLine = note.text.split('\n', 1)[0].trim();
          const title = (plainTitle || rawFirstLine).slice(0, PLAN_TITLE_MAX);
          const truncated = title !== note.text.trim();

          const day = await ItineraryDay.findOneAndUpdate(
            { _id: validation.data.day_id, trip: membership.tripId, ...activityCapacityFilter(1) },
            {
              $inc: { revision: 1 },
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
            },
            { session: transactionSession }
          ).select('dayNumber');
          if (!day) {
            const exists = await ItineraryDay.findOne(
              {
                _id: validation.data.day_id,
                trip: membership.tripId,
              },
              { _id: 1 },
              { session: transactionSession }
            );
            const code = exists ? 'ACTIVITY_LIMIT' : 'NOT_FOUND';
            throw new NotePlanningError(code);
          }

          const updated = await Note.findOneAndUpdate(
            { _id: noteId, trip: membership.tripId, plannedAt: null },
            { $set: { plannedAt: new Date(), plannedDayNumber: day.dayNumber } },
            { new: true, session: transactionSession }
          ).lean<TripNoteDtoInput | null>();
          if (!updated) {
            throw new NotePlanningError('NOT_FOUND');
          }

          return updated;
        }
      );

      revalidatePath(`/trips/${tripIdOrCode}/notes`);
      revalidatePath(`/trips/${tripIdOrCode}`);
      return { success: true, data: toTripNoteDto(updated) };
    } catch (error) {
      if (error instanceof NotePlanningError) {
        return { success: false, error: error.code, code: error.code };
      }
      logger.error('Plan note error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 簽發隨手記照片的短效檢視 URL。驗成員身分，且 key 須屬本 trip 的筆記前綴——
 * 一團的成員即使得知別團的 key 也簽不出來。比照 getItineraryAttachmentUrl
 * （筆記照片與收據共用私有 receipts bucket，前綴不同）。隨手記無公開分享路由，
 * 故照片僅登入成員可見。
 */
export const getNoteAttachmentUrl = withAuth(
  async (session, tripIdOrCode: string, key: string): Promise<ActionResult<{ url: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (!isNoteKeyForTrip(membership.tripId, key)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const url = await presignGet('receipts', key);
      return { success: true, data: { url } };
    } catch (error) {
      logger.error('getNoteAttachmentUrl error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
