'use server';

import { dbConnect } from '@/lib/mongodb';
import { Expense, ItineraryDay, Photo, Trip } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import {
  createItineraryDaySchema,
  updateItineraryDaySchema,
  type ActivityInput,
} from '@/lib/validation';
import type { ActionResult } from './types';
import type { Activity as ActivityDto, ItineraryDay as ItineraryDayDto, Location } from '@/types';
import { withAuth } from './withAuth';
import { logger } from '@/lib/logger';
import { isItineraryKeyForTrip, ITINERARY_CONTENT_TYPES, MAX_ITINERARY_BYTES } from '@/lib/uploads';
import { headObject, deleteObjects, presignGet } from '@/lib/storage';
import { rebindAutoPhotosToItinerary } from '@/lib/photoItinerary';

type LeanAttachment = {
  key: string;
  contentType: string;
  size: number;
  uploadedBy: { toString(): string };
  uploadedAt: Date;
};

type LeanActivity = {
  _id: { toString(): string };
  time?: string | null;
  endTime?: string | null;
  title: string;
  type: ActivityDto['type'];
  location?: Location | null;
  note?: string;
  confirmationCode?: string;
  attachments?: LeanAttachment[];
};

type LeanDay = {
  _id: { toString(): string };
  trip: { toString(): string };
  dayNumber: number;
  title: string;
  content: string;
  location?: Location | null;
  activities?: LeanActivity[];
  createdAt: Date;
  updatedAt: Date;
};

function toActivityDto(a: LeanActivity): ActivityDto {
  return {
    id: a._id.toString(),
    time: a.time ?? null,
    end_time: a.endTime ?? null,
    title: a.title,
    type: a.type,
    location: a.location ?? null,
    note: a.note ?? '',
    confirmation_code: a.confirmationCode ?? '',
    // 只帶 key + 中繼資料（不含 url）；檢視時走 getItineraryAttachmentUrl 簽短效 GET。
    attachments: (a.attachments ?? []).map((at) => ({
      key: at.key,
      content_type: at.contentType,
      size: at.size,
    })),
  };
}

type AttachmentDoc = {
  key: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
};

/**
 * 把一個活動的票券附件輸入轉成儲存用 doc。已存在的 key（existingByKey）直接沿用
 * （保留 uploadedBy/At）；新 key 以 **headObject** 驗證——key 須屬本 trip 的票券前綴、
 * 物件須存在、size/type 以實際物件為準再核對白名單/上限（防 client 謊報）。
 * 任一參照無效回 null（呼叫端對應 VALIDATION_ERROR）。
 */
async function resolveActivityAttachments(
  tripId: string,
  uploaderId: string,
  inputs: { key: string }[],
  existingByKey: Map<string, AttachmentDoc>
): Promise<AttachmentDoc[] | null> {
  const docs: AttachmentDoc[] = [];
  for (const input of inputs) {
    const existing = existingByKey.get(input.key);
    if (existing) {
      docs.push(existing);
      continue;
    }
    if (!isItineraryKeyForTrip(tripId, input.key)) return null;
    const head = await headObject('receipts', input.key);
    if (!head) return null;
    if (head.size > MAX_ITINERARY_BYTES) return null;
    if (!(ITINERARY_CONTENT_TYPES as readonly string[]).includes(head.contentType)) return null;
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
 * 把驗證後的活動陣列轉成 model 儲存形狀，並把票券附件 key 解析成完整 doc。
 * activities 由 update/create **整批覆寫**，故附件以 key 為穩定身分跨整天 diff：
 * existingByKey 帶入當天現有附件（create 時為空），新 key 走 headObject 驗證、舊 key 沿用。
 * 回傳儲存陣列 + 此次保留/新增的所有 key 集合（呼叫端用來算出被移除、需刪 R2 的孤兒）。
 */
async function buildActivitiesStorage(
  tripId: string,
  uploaderId: string,
  activities: ActivityInput[],
  existingByKey: Map<string, AttachmentDoc>
): Promise<{ storage: Record<string, unknown>[]; keptKeys: Set<string> } | null> {
  const storage: Record<string, unknown>[] = [];
  const keptKeys = new Set<string>();
  for (const a of activities) {
    const resolved = await resolveActivityAttachments(
      tripId,
      uploaderId,
      a.attachments ?? [],
      existingByKey
    );
    if (!resolved) return null;
    for (const at of resolved) keptKeys.add(at.key);
    storage.push({
      time: a.time ?? null,
      endTime: a.end_time ?? null,
      title: a.title,
      type: a.type,
      location: a.location ?? null,
      note: a.note ?? '',
      confirmationCode: a.confirmation_code ?? '',
      attachments: resolved,
    });
  }
  return { storage, keptKeys };
}

/** 蒐集一天所有活動的附件 key → doc，作為覆寫時的 diff 基準。 */
function attachmentsByKey(activities: LeanActivity[] | undefined): Map<string, AttachmentDoc> {
  const map = new Map<string, AttachmentDoc>();
  for (const a of activities ?? []) {
    for (const at of a.attachments ?? []) {
      map.set(at.key, {
        key: at.key,
        contentType: at.contentType,
        size: at.size,
        uploadedBy: at.uploadedBy.toString(),
        uploadedAt: at.uploadedAt,
      });
    }
  }
  return map;
}

function toDayDto(d: LeanDay): ItineraryDayDto {
  return {
    id: d._id.toString(),
    trip_id: d.trip.toString(),
    day_number: d.dayNumber,
    title: d.title,
    content: d.content,
    location: d.location ?? null,
    activities: (d.activities ?? []).map(toActivityDto),
    created_at: d.createdAt.toISOString(),
    updated_at: d.updatedAt.toISOString(),
  };
}

/**
 * Get all itinerary days for a trip
 */
export const getItinerary = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<ItineraryDayDto[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const days = await ItineraryDay.find({ trip: membership.tripId })
        .sort({ dayNumber: 1 })
        .lean<LeanDay[]>();

      return { success: true, data: days.map(toDayDto) };
    } catch (error) {
      logger.error('Get itinerary error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Create a new itinerary day
 */
export const createItineraryDay = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: {
      title: string;
      content?: string;
      location?: Location | null;
      activities?: ActivityInput[];
    }
  ): Promise<ActionResult<ItineraryDayDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      const validated = createItineraryDaySchema.parse(input);

      // 票券附件驗證（建立時無既有附件，故 existingByKey 為空）
      const built = await buildActivitiesStorage(
        membership.tripId,
        session.userId,
        validated.activities ?? [],
        new Map()
      );
      if (!built) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      // Next day_number
      const last = await ItineraryDay.findOne({ trip: membership.tripId })
        .sort({ dayNumber: -1 })
        .select('dayNumber')
        .lean<{ dayNumber: number } | null>();
      const nextDayNumber = last ? last.dayNumber + 1 : 1;

      const created = await ItineraryDay.create({
        trip: membership.tripId,
        dayNumber: nextDayNumber,
        title: validated.title,
        content: validated.content || '',
        location: validated.location ?? null,
        activities: built.storage,
      });

      const trip = await Trip.findById(membership.tripId)
        .select('startDate endDate')
        .lean<{ startDate?: Date | null; endDate?: Date | null } | null>();
      if (trip) {
        await rebindAutoPhotosToItinerary(membership.tripId, trip.startDate, trip.endDate).catch(
          (e) => logger.error('Create itinerary day: auto photo rebind failed', e)
        );
      }

      return { success: true, data: toDayDto(created.toObject() as unknown as LeanDay) };
    } catch (error) {
      logger.error('Create itinerary day error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Update an itinerary day
 */
export const updateItineraryDay = withAuth(
  async (
    session,
    tripIdOrCode: string,
    dayId: string,
    input: {
      title?: string;
      content?: string;
      day_number?: number;
      location?: Location | null;
      activities?: ActivityInput[];
    }
  ): Promise<ActionResult<ItineraryDayDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      const validated = updateItineraryDaySchema.parse(input);

      const set: Record<string, unknown> = {};
      if (validated.title !== undefined) set.title = validated.title;
      if (validated.content !== undefined) set.content = validated.content;
      if (validated.day_number !== undefined) set.dayNumber = validated.day_number;
      // location 可被設為 null 以清除；故只要欄位有出現（!== undefined）就寫入。
      if (validated.location !== undefined) set.location = validated.location;

      // activities 整陣列覆寫（同 splits 的取捨）；子文件 _id 由 Mongoose 重新產生。
      // 票券附件以 key 為穩定身分跨整天 diff：新 key 走 headObject 驗證、舊 key 沿用、
      // 被移除的 key 在更新成功後 best-effort 刪 R2（同 updateExpense 的收據清理）。
      let removedKeys: string[] = [];
      if (validated.activities !== undefined) {
        const currentDay = await ItineraryDay.findOne({ _id: dayId, trip: membership.tripId })
          .select('activities.attachments')
          .lean<{ activities?: LeanActivity[] } | null>();
        if (!currentDay) {
          return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
        }
        const existingByKey = attachmentsByKey(currentDay.activities);
        const built = await buildActivitiesStorage(
          membership.tripId,
          session.userId,
          validated.activities,
          existingByKey
        );
        if (!built) {
          return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
        }
        set.activities = built.storage;
        removedKeys = [...existingByKey.keys()].filter((k) => !built.keptKeys.has(k));
      }

      const updated = await ItineraryDay.findOneAndUpdate(
        { _id: dayId, trip: membership.tripId },
        { $set: set },
        { new: true }
      ).lean<LeanDay | null>();

      if (!updated) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      if (removedKeys.length > 0) {
        // best-effort：孤兒票券刪不掉不該擋住更新
        await deleteObjects('receipts', removedKeys).catch((e) =>
          logger.error('Update itinerary day: ticket cleanup failed', e)
        );
      }

      // 當日地點換了（或被清掉）→ 跟著更新「借」這天座標的相片。借來的座標必須跟著來源走，
      // 否則改了地點之後相片會停在舊城市、清了地點之後相片會留著無來源的座標。
      // 只動 source 'itinerary' 或原本無座標的：相片自己的 GPS 與手動釘比整天共用的
      // 城市座標精確，不可覆蓋；先前因當日沒地點而借不到座標的相片則可在這次補上。
      if (validated.location !== undefined) {
        const { lat, lon } = validated.location ?? {};
        const borrowed =
          typeof lat === 'number' && typeof lon === 'number'
            ? { lat, lon, source: 'itinerary' as const }
            : null;
        await Photo.updateMany(
          {
            trip: membership.tripId,
            itineraryDay: dayId,
            ...(borrowed
              ? {
                  $or: [{ 'location.source': 'itinerary' }, { location: null }],
                }
              : { 'location.source': 'itinerary' }),
          },
          { $set: { location: borrowed } }
        );
      }

      return { success: true, data: toDayDto(updated) };
    } catch (error) {
      logger.error('Update itinerary day error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Delete an itinerary day and renumber remaining days.
 * 取代原 Postgres RPC：刪除後以遞增順序 bulkWrite 重新編號，避免 (trip, dayNumber) 唯一索引衝突。
 */
export const deleteItineraryDay = withAuth(
  async (
    session,
    tripIdOrCode: string,
    dayId: string
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      await dbConnect();

      // 先讀附件 key 以便刪 R2 物件（attachments 內嵌於 activities，隨文件一併移除）
      const doc = await ItineraryDay.findOne({ _id: dayId, trip: membership.tripId })
        .select('activities.attachments.key')
        .lean<{ activities?: { attachments?: { key: string }[] }[] } | null>();

      await ItineraryDay.deleteOne({ _id: dayId, trip: membership.tripId });

      const ticketKeys = (doc?.activities ?? []).flatMap((a) =>
        (a.attachments ?? []).map((at) => at.key)
      );
      if (ticketKeys.length > 0) {
        // best-effort：孤兒票券刪不掉不該擋住刪除行程日
        await deleteObjects('receipts', ticketKeys).catch((e) =>
          logger.error('Delete itinerary day: ticket cleanup failed', e)
        );
      }

      // 清掉支出對此行程日的關聯（從可複選的陣列 $pull 掉；避免孤兒參照，比照 removeMember
      // 清 checklist 指派）。其他關聯日保留。
      await Expense.updateMany(
        { trip: membership.tripId, itineraryDays: dayId },
        { $pull: { itineraryDays: dayId } }
      );

      // 同理清掉相簿相片對此行程日的關聯。**順序有意義**：先收回「借」自這天的座標
      // （條件靠 itineraryDay 篩），再解除關聯。相片自己的 GPS（source 'exif'）與手動釘
      // （'manual'）不受影響——只有借來的座標會隨來源消失，否則地圖上會留下沒有任何
      // 來源可解釋的釘子（規則見 photo.actions.ts 的 deriveItineraryLocation）。
      await Photo.updateMany(
        { trip: membership.tripId, itineraryDay: dayId, 'location.source': 'itinerary' },
        { $set: { location: null } }
      );
      await Photo.updateMany(
        { trip: membership.tripId, itineraryDay: dayId },
        { $set: { itineraryDay: null } }
      );

      // 重新編號剩餘行程日為連續 1..n（遞增處理，數字只會變小，不會撞到唯一索引）
      const remaining = await ItineraryDay.find({ trip: membership.tripId })
        .sort({ dayNumber: 1 })
        .select('_id dayNumber')
        .lean<{ _id: { toString(): string }; dayNumber: number }[]>();

      const ops = remaining
        .map((d, i) => ({ d, newNumber: i + 1 }))
        .filter(({ d, newNumber }) => d.dayNumber !== newNumber)
        .map(({ d, newNumber }) => ({
          updateOne: {
            filter: { _id: d._id },
            update: { $set: { dayNumber: newNumber } },
          },
        }));

      if (ops.length > 0) {
        await ItineraryDay.bulkWrite(ops, { ordered: true });
      }

      const trip = await Trip.findById(membership.tripId)
        .select('startDate endDate')
        .lean<{ startDate?: Date | null; endDate?: Date | null } | null>();
      if (trip) {
        await rebindAutoPhotosToItinerary(membership.tripId, trip.startDate, trip.endDate).catch(
          (e) => logger.error('Delete itinerary day: auto photo rebind failed', e)
        );
      }

      return { success: true, data: { message: 'DELETED' } };
    } catch (error) {
      logger.error('Delete itinerary day error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Sign a short-lived GET URL for a ticket attachment. Membership-gated, and the
 * key must belong to this trip's itinerary namespace — so a member of one trip
 * can't sign another trip's ticket even if they learn its key. Mirrors
 * getReceiptUrl (tickets share the private receipts bucket, different prefix).
 */
export const getItineraryAttachmentUrl = withAuth(
  async (session, tripIdOrCode: string, key: string): Promise<ActionResult<{ url: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (!isItineraryKeyForTrip(membership.tripId, key)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const url = await presignGet('receipts', key);
      return { success: true, data: { url } };
    } catch (error) {
      logger.error('getItineraryAttachmentUrl error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
