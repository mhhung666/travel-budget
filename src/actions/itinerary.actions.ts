'use server';

import { MAX_ACTIVITIES_PER_DAY, activityCapacityFilter } from '@/lib/itineraryLimits';
import { readItinerary, toDayDto, type LeanActivity, type LeanDay } from '@/lib/itineraryRead';
import { dbConnect } from '@/lib/mongodb';
import mongoose from 'mongoose';
import {
  deleteItineraryDayAtomically,
  ItineraryDayDeletionError,
} from '@/lib/itineraryDayDeletion';
import { ItineraryDay, Photo } from '@/models';
import {
  createItineraryDayAtomically,
  ItineraryDayCreationError,
} from '@/lib/itineraryDayCreation';
import { getTripMembership } from '@/lib/permissions';
import {
  createItineraryDaySchema,
  mutateItineraryActivitySchema,
  type MutateItineraryActivityInput,
  updateItineraryDaySchema,
  type ActivityInput,
  type UpdateActivityInput,
} from '@/lib/validation';
import type { ActionResult } from './types';
import type { ItineraryDay as ItineraryDayDto, Location } from '@/types';
import { withAuth } from './withAuth';
import { logger } from '@/lib/logger';
import { isItineraryKeyForTrip, ITINERARY_CONTENT_TYPES, MAX_ITINERARY_BYTES } from '@/lib/uploads';
import { headObject, deleteObjects, presignGet } from '@/lib/storage';

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
  activities: (ActivityInput & { id?: string | null })[],
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
      ...(a.id ? { _id: a.id } : {}),
      time: a.time ?? null,
      endTime: a.end_time ?? null,
      title: a.title,
      type: a.type,
      location: a.location ?? null,
      locationName: a.location_name ?? '',
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

      return { success: true, data: await readItinerary(membership.tripId, true) };
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

      if (Array.isArray(input.activities) && input.activities.length > MAX_ACTIVITIES_PER_DAY) {
        return { success: false, error: 'ACTIVITY_LIMIT', code: 'ACTIVITY_LIMIT' };
      }
      const parsed = createItineraryDaySchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }
      const validated = parsed.data;

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

      await dbConnect();
      const created = await createItineraryDayAtomically(
        mongoose.connection.db!,
        membership.tripId,
        session.userId,
        {
          title: validated.title,
          content: validated.content || '',
          location: validated.location ?? null,
          activities: built.storage,
        }
      );
      return { success: true, data: toDayDto(created as unknown as LeanDay) };
    } catch (error) {
      if (error instanceof ItineraryDayCreationError) {
        return { success: false, error: error.code, code: error.code };
      }
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
      expected_revision: number;
      title?: string;
      content?: string;
      day_number?: number;
      location?: Location | null;
      activities?: UpdateActivityInput[];
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

      if (Array.isArray(input.activities) && input.activities.length > MAX_ACTIVITIES_PER_DAY) {
        return { success: false, error: 'ACTIVITY_LIMIT', code: 'ACTIVITY_LIMIT' };
      }
      const parsed = updateItineraryDaySchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }
      const validated = parsed.data;
      const currentDay = await ItineraryDay.findOne({ _id: dayId, trip: membership.tripId })
        .select('activities._id activities.revision activities.attachments updatedAt revision')
        .lean<{ activities?: LeanActivity[]; updatedAt: Date; revision: number } | null>();
      if (!currentDay) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const expectedUpdatedAt = currentDay.updatedAt;
      if (currentDay.revision !== validated.expected_revision) {
        return { success: false, error: 'CONFLICT', code: 'CONFLICT' };
      }

      // Keep display timestamps monotonic; revision is the compare-and-set token.
      const set: Record<string, unknown> = {
        updatedAt: new Date(Math.max(Date.now(), expectedUpdatedAt.getTime() + 1)),
      };
      if (validated.title !== undefined) set.title = validated.title;
      if (validated.content !== undefined) set.content = validated.content;
      if (validated.day_number !== undefined) set.dayNumber = validated.day_number;
      // location 可被設為 null 以清除；故只要欄位有出現（!== undefined）就寫入。
      if (validated.location !== undefined) set.location = validated.location;

      // activities 暫時仍整陣列覆寫；保留已驗證的既有 ID，只有 id: null 的新列產生 ID。
      // 票券附件以 key 為穩定身分跨整天 diff：新 key 走 headObject 驗證、舊 key 沿用、
      // 被移除的 key 在更新成功後 best-effort 刪 R2（同 updateExpense 的收據清理）。
      let removedKeys: string[] = [];
      if (validated.activities !== undefined) {
        const existingIds = new Set((currentDay.activities ?? []).map((a) => a._id.toString()));
        const suppliedIds = validated.activities.flatMap((a) => (a.id === null ? [] : [a.id]));
        if (
          new Set(suppliedIds).size !== suppliedIds.length ||
          suppliedIds.some((id) => !existingIds.has(id))
        ) {
          return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
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
        // A whole-array replacement invalidates every retained activity snapshot.
        const revisions = new Map(
          (currentDay.activities ?? []).map((a) => [a._id.toString(), a.revision])
        );
        set.activities = built.storage.map((a, index) => ({
          ...a,
          revision:
            validated.activities![index].id === null
              ? 0
              : revisions.get(validated.activities![index].id!)! + 1,
        }));
        removedKeys = [...existingByKey.keys()].filter((k) => !built.keptKeys.has(k));
      }

      const updated = await ItineraryDay.findOneAndUpdate(
        { _id: dayId, trip: membership.tripId, revision: validated.expected_revision },
        { $set: set, $inc: { revision: 1 } },
        { new: true, timestamps: false }
      ).lean<LeanDay | null>();

      if (!updated) {
        // The day changed or disappeared after the snapshot read. In particular,
        // do not delete ticket blobs or propagate locations for a rejected write.
        return { success: false, error: 'CONFLICT', code: 'CONFLICT' };
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

/** Match the target ID and revision in the same array element; siblings may change concurrently. */
export const mutateItineraryActivity = withAuth(
  async (
    session,
    tripIdOrCode: string,
    dayId: string,
    input: MutateItineraryActivityInput
  ): Promise<ActionResult<ItineraryDayDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }
      const parsed = mutateItineraryActivitySchema.safeParse(input);
      if (!parsed.success || !/^[a-f0-9]{24}$/.test(dayId)) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }
      const data = parsed.data;
      const current = await ItineraryDay.findOne({ _id: dayId, trip: membership.tripId })
        .select('activities._id activities.revision activities.attachments updatedAt revision')
        .lean<{ activities?: LeanActivity[]; updatedAt: Date; revision: number } | null>();
      if (!current) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      const expectedUpdatedAt = current.updatedAt;
      if (data.operation === 'add' && (current.activities?.length ?? 0) >= MAX_ACTIVITIES_PER_DAY) {
        return { success: false, error: 'ACTIVITY_LIMIT', code: 'ACTIVITY_LIMIT' };
      }
      const target =
        data.operation === 'add'
          ? undefined
          : current.activities?.find((a) => a._id.toString() === data.activity_id);
      if (data.operation !== 'add' && !target) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (data.operation !== 'add' && target!.revision !== data.expected_activity_revision) {
        return { success: false, error: 'CONFLICT', code: 'CONFLICT' };
      }
      const existingAttachments = attachmentsByKey(target ? [target] : []);
      const set: Record<string, unknown> = {};
      const update: Record<string, unknown> = {
        $inc: { revision: 1 },
        // Concurrent sibling writes must not move the display timestamp backwards.
        $max: { updatedAt: new Date(Math.max(Date.now(), expectedUpdatedAt.getTime() + 1)) },
      };
      if (data.operation === 'delete') {
        update.$pull = { activities: { _id: data.activity_id } };
      } else {
        const built = await buildActivitiesStorage(
          membership.tripId,
          session.userId,
          [data.activity],
          existingAttachments
        );
        if (!built) return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
        if (data.operation === 'add') {
          update.$push = { activities: built.storage[0] };
        } else {
          set['activities.$'] = {
            ...built.storage[0],
            _id: data.activity_id,
            revision: data.expected_activity_revision + 1,
          };
          update.$set = set;
        }
      }
      const updated = await ItineraryDay.findOneAndUpdate(
        {
          _id: dayId,
          trip: membership.tripId,
          ...(data.operation === 'add'
            ? activityCapacityFilter(1)
            : {
                activities: {
                  $elemMatch: { _id: data.activity_id, revision: data.expected_activity_revision },
                },
              }),
        },
        update,
        { new: true, timestamps: false }
      ).lean<LeanDay | null>();
      if (!updated) return { success: false, error: 'CONFLICT', code: 'CONFLICT' };

      // A ticket can still be referenced by a sibling activity. Only clean removed
      // target keys absent from the complete, successfully written day.
      const keptKeys = attachmentsByKey(updated.activities);
      const removedKeys = [...existingAttachments.keys()].filter((key) => !keptKeys.has(key));
      if (removedKeys.length) {
        await deleteObjects('receipts', removedKeys).catch((error) =>
          logger.error('Mutate itinerary activity: ticket cleanup failed', error)
        );
      }
      return { success: true, data: toDayDto(updated) };
    } catch (error) {
      logger.error('Mutate itinerary activity error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Delete an itinerary day and renumber remaining days.
 * 刪除、關聯清理、重新編號與相片重綁在同一交易完成；提交後才清理票券。
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

      if (!/^[a-f0-9]{24}$/i.test(dayId)) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }
      const ticketKeys = await deleteItineraryDayAtomically(
        mongoose.connection.db!,
        membership.tripId,
        session.userId,
        dayId
      );
      if (ticketKeys.length) {
        await deleteObjects('receipts', ticketKeys).catch((error) =>
          logger.error('Delete itinerary day: ticket cleanup failed', error)
        );
      }

      return { success: true, data: { message: 'DELETED' } };
    } catch (error) {
      if (error instanceof ItineraryDayDeletionError) {
        return { success: false, error: error.code, code: error.code };
      }
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
