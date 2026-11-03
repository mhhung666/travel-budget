import {
  assertBlobsAvailable,
  retireUnreferencedBlobs,
  RetiredBlobError,
} from '@/lib/blobReferences';
import { cleanupRetiredBlobs } from '@/lib/blobCleanup';
import { MAX_ACTIVITIES_PER_DAY, activityCapacityFilter } from '@/lib/itineraryLimits';
import { toDayDto, type LeanActivity, type LeanDay } from '@/lib/itineraryRead';
import { dbConnect } from '@/lib/mongodb';
import mongoose from 'mongoose';
import {
  deleteItineraryDayAtomically,
  ItineraryDayDeletionError,
} from '@/lib/itineraryDayDeletion';
import {
  withItineraryDayUpdateTransaction,
  ItineraryDayUpdateError,
} from '@/lib/itineraryDayUpdate';
import { rebindAutoPhotosInTransaction } from '@/lib/photoItineraryTransaction';
import { ItineraryDay, Photo } from '@/models';
import {
  createItineraryDayAtomically,
  ItineraryDayCreationError,
} from '@/lib/itineraryDayCreation';
import { dayNumberForDate, toDateOnly } from '@/lib/itineraryDayTarget';
import { getTripMembership } from '@/lib/permissions';
import {
  createItineraryDaySchema,
  mutateItineraryActivitySchema,
  type MutateItineraryActivityInput,
  updateItineraryDaySchema,
  type ItineraryDayTargetInput,
  type ActivityInput,
  type UpdateActivityInput,
} from '@/lib/validation';
import type { ActionResult } from '@/actions/types';
import type { ItineraryDay as ItineraryDayDto, Location } from '@/types';
import { logger } from '@/lib/logger';
import { resolveItineraryAttachments, type AttachmentDoc } from '@/lib/itineraryAttachments';

import type { ItineraryWriteContext } from './itineraryDayUpdate';

async function cleanupAfterWrite(keys: string[], context?: ItineraryWriteContext) {
  if (context) context.cleanupKeys.push(...keys);
  else await cleanupRetiredBlobs(mongoose.connection.db!, keys);
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
  const resolvedByKey = await resolveItineraryAttachments(
    tripId,
    uploaderId,
    activities.flatMap((activity) => activity.attachments ?? []),
    existingByKey
  );
  if (!resolvedByKey) return null;
  const storage: Record<string, unknown>[] = [];
  const keptKeys = new Set<string>();
  for (const a of activities) {
    // Reconstruct in submitted order regardless of HEAD completion order.
    const resolved = (a.attachments ?? []).map(({ key }) => resolvedByKey.get(key)!);
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

export async function createItineraryDayForActor(
  actorId: string,
  tripIdOrCode: string,
  input: {
    title: string;
    content?: string;
    location?: Location | null;
    activities?: ActivityInput[];
    /** 新增目標（日期或第幾天）。省略＝尚未更新的舊頁面，沿用接在最後一天。 */
    target?: ItineraryDayTargetInput;
  },
  context?: ItineraryWriteContext
): Promise<ActionResult<ItineraryDayDto>> {
  try {
    const membership = context
      ? { tripId: tripIdOrCode, role: 'admin' as const }
      : await getTripMembership(actorId, tripIdOrCode);
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
      actorId,
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
      actorId,
      {
        title: validated.title,
        content: validated.content || '',
        location: validated.location ?? null,
        activities: built.storage,
        target: validated.target,
      },
      context
    );
    return { success: true, data: toDayDto(created as unknown as LeanDay) };
  } catch (error) {
    if (context) throw error;
    if (error instanceof RetiredBlobError)
      return { success: false, error: error.code, code: error.code };
    if (error instanceof ItineraryDayCreationError) {
      return { success: false, error: error.code, code: error.code };
    }
    logger.error('Create itinerary day error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

export async function updateItineraryDayForActor(
  actorId: string,
  tripIdOrCode: string,
  dayId: string,
  input: {
    expected_revision: number;
    title?: string;
    content?: string;
    day_number?: number;
    location?: Location | null;
    activities?: UpdateActivityInput[];
  },
  context?: ItineraryWriteContext
): Promise<ActionResult<ItineraryDayDto>> {
  try {
    const membership = context
      ? { tripId: tripIdOrCode, role: 'admin' as const }
      : await getTripMembership(actorId, tripIdOrCode);
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
    const currentDayQuery = ItineraryDay.findOne({ _id: dayId, trip: membership.tripId })
      .select(
        'activities._id activities.revision activities.attachments updatedAt revision dayNumber'
      )
      .lean<{
        activities?: LeanActivity[];
        updatedAt: Date;
        revision: number;
        dayNumber: number;
      } | null>();
    const currentDay = await (context
      ? currentDayQuery.setOptions(context.options())
      : currentDayQuery);
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
    // 真正換到別天才需要重驗範圍與唯一性（見交易內）；重送同一天視為沒動。
    const movedTo =
      validated.day_number !== undefined && validated.day_number !== currentDay.dayNumber
        ? validated.day_number
        : null;
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
        actorId,
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

    await dbConnect();
    const updated = await withItineraryDayUpdateTransaction(
      mongoose.connection.db!,
      membership.tripId,
      actorId,
      async (transactionSession, parent) => {
        // 只在真的換天時驗證：舊資料原本就超出旅程範圍時，仍可純編輯內容不被擋。
        if (movedTo !== null) {
          const startDate = toDateOnly(parent.startDate);
          const endDate = toDateOnly(parent.endDate);
          if (startDate && endDate && dayNumberForDate(startDate, endDate) < movedTo) {
            throw new ItineraryDayUpdateError('DATE_OUTSIDE_TRIP');
          }
          const takenQuery = ItineraryDay.findOne({
            trip: membership.tripId,
            dayNumber: movedTo,
          })
            .select('_id')
            .session(transactionSession)
            .lean<{ _id: mongoose.Types.ObjectId } | null>();
          const taken = await (context ? takenQuery.setOptions(context.options()) : takenQuery);
          if (taken) throw new ItineraryDayUpdateError('DAY_ALREADY_EXISTS');
        }

        const day = await ItineraryDay.findOneAndUpdate(
          { _id: dayId, trip: membership.tripId, revision: validated.expected_revision },
          { $set: set, $inc: { revision: 1 } },
          {
            new: true,
            timestamps: false,
            session: transactionSession,
            ...(context?.options() ?? {}),
          }
        )
          .lean<LeanDay | null>()
          // 兩人同時改到同一天：唯一索引是最後防線，轉成可辨識的錯誤碼。
          .catch((error: unknown) => {
            if ((error as { code?: number }).code === 11000) {
              throw new ItineraryDayUpdateError('DAY_ALREADY_EXISTS');
            }
            throw error;
          });

        if (!day) throw new ItineraryDayUpdateError('CONFLICT');
        await assertBlobsAvailable(
          mongoose.connection.db!,
          transactionSession,
          [...attachmentsByKey(day.activities).keys()],
          context?.options
        );
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
            { $set: { location: borrowed } },
            { session: transactionSession, ...(context?.options() ?? {}) }
          );
        }

        if (validated.day_number !== undefined) {
          await rebindAutoPhotosInTransaction(
            mongoose.connection.db!,
            transactionSession,
            new mongoose.mongo.ObjectId(membership.tripId),
            parent,
            new Date(),
            context?.options
          );
        }
        await retireUnreferencedBlobs(
          mongoose.connection.db!,
          transactionSession,
          membership.tripId,
          removedKeys,
          context?.options
        );
        return day;
      },
      context
    );
    await cleanupAfterWrite(removedKeys, context);

    return { success: true, data: toDayDto(updated) };
  } catch (error) {
    if (context) throw error;
    if (error instanceof RetiredBlobError)
      return { success: false, error: error.code, code: error.code };
    if (error instanceof ItineraryDayUpdateError) {
      return { success: false, error: error.code, code: error.code };
    }
    logger.error('Update itinerary day error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

export async function mutateItineraryActivityForActor(
  actorId: string,
  tripIdOrCode: string,
  dayId: string,
  input: MutateItineraryActivityInput,
  context?: ItineraryWriteContext
): Promise<ActionResult<ItineraryDayDto>> {
  try {
    const membership = context
      ? { tripId: tripIdOrCode, role: 'admin' as const }
      : await getTripMembership(actorId, tripIdOrCode);
    if (!membership) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    if (membership.role !== 'admin') {
      return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
    }
    const parsed = mutateItineraryActivitySchema.safeParse(input);
    if (!parsed.success || !/^[a-f0-9]{24}$/.test(dayId)) {
      return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
    }
    const data = parsed.data;
    const currentQuery = ItineraryDay.findOne({ _id: dayId, trip: membership.tripId })
      .select('activities._id activities.revision activities.attachments updatedAt revision')
      .lean<{ activities?: LeanActivity[]; updatedAt: Date; revision: number } | null>();
    const current = await (context ? currentQuery.setOptions(context.options()) : currentQuery);
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
        actorId,
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
    await dbConnect();
    const updated = await withItineraryDayUpdateTransaction(
      mongoose.connection.db!,
      membership.tripId,
      actorId,
      async (transactionSession) => {
        const day = await ItineraryDay.findOneAndUpdate(
          {
            _id: dayId,
            trip: membership.tripId,
            ...(data.operation === 'add'
              ? activityCapacityFilter(1)
              : {
                  activities: {
                    $elemMatch: {
                      _id: data.activity_id,
                      revision: data.expected_activity_revision,
                    },
                  },
                }),
          },
          update,
          {
            new: true,
            timestamps: false,
            session: transactionSession,
            ...(context?.options() ?? {}),
          }
        ).lean<LeanDay | null>();
        if (!day) throw new ItineraryDayUpdateError('CONFLICT');
        await assertBlobsAvailable(
          mongoose.connection.db!,
          transactionSession,
          [...attachmentsByKey(day.activities).keys()],
          context?.options
        );
        await retireUnreferencedBlobs(
          mongoose.connection.db!,
          transactionSession,
          membership.tripId,
          [...existingAttachments.keys()].filter(
            (key) => !attachmentsByKey(day.activities).has(key)
          ),
          context?.options
        );
        return day;
      },
      context
    );

    // A ticket can still be referenced by a sibling activity. Only clean removed
    // target keys absent from the complete, successfully written day.
    const keptKeys = attachmentsByKey(updated.activities);
    const removedKeys = [...existingAttachments.keys()].filter((key) => !keptKeys.has(key));
    await cleanupAfterWrite(removedKeys, context);
    return { success: true, data: toDayDto(updated) };
  } catch (error) {
    if (context) throw error;
    if (error instanceof RetiredBlobError)
      return { success: false, error: error.code, code: error.code };
    if (error instanceof ItineraryDayUpdateError) {
      return { success: false, error: error.code, code: error.code };
    }
    logger.error('Mutate itinerary activity error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

export async function deleteItineraryDayForActor(
  actorId: string,
  tripIdOrCode: string,
  dayId: string,
  context?: ItineraryWriteContext
): Promise<ActionResult<{ message: string }>> {
  try {
    const membership = context
      ? { tripId: tripIdOrCode, role: 'admin' as const }
      : await getTripMembership(actorId, tripIdOrCode);
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
      actorId,
      dayId,
      context
    );
    await cleanupAfterWrite(ticketKeys, context);
    return { success: true, data: { message: 'DELETED' } };
  } catch (error) {
    if (context) throw error;
    if (error instanceof ItineraryDayDeletionError) {
      return { success: false, error: error.code, code: error.code };
    }
    logger.error('Delete itinerary day error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}
