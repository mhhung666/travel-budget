'use server';

import { revalidatePath } from 'next/cache';
import { Checklist, Trip } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import {
  createChecklistSchema,
  createChecklistWithItemsSchema,
  updateChecklistSchema,
  addChecklistItemSchema,
  updateChecklistItemSchema,
  type CreateChecklistInput,
  type CreateChecklistWithItemsInput,
  type UpdateChecklistInput,
  type AddChecklistItemInput,
  type UpdateChecklistItemInput,
} from '@/lib/validation';
import type { ActionResult } from './types';
import type { Checklist as ChecklistDto } from '@/types';
import { withAuth } from './withAuth';
import { logger } from '@/lib/logger';
import { toChecklistDto, type ChecklistDtoInput } from '@/lib/dto';

/**
 * 打包清單 / 待辦清單 actions。比照 ItineraryDay 為旅程下的獨立子集合，但採**成員信任模型**
 * （任何成員皆可建立/編輯/刪除，與 expense / payment 一致），而非行程那種 admin-only——
 * 打包清單本質上是協作工具，人人都要能新增與勾選。
 *
 * 每個讀寫都把 items.assignee 一併 populate，交給共用的 `toChecklistDto` 轉成前端 DTO。
 */

const ITEM_POPULATE = { path: 'items.assignee', select: 'username displayName' } as const;

/** 讀回一份（已 populate assignee 的）清單並轉 DTO；查不到回 null。 */
async function findChecklistDto(checklistId: string, tripId: string): Promise<ChecklistDto | null> {
  const doc = await Checklist.findOne({ _id: checklistId, trip: tripId })
    .populate(ITEM_POPULATE)
    .lean<ChecklistDtoInput | null>();
  return doc ? toChecklistDto(doc) : null;
}

/** assignee 必須是本旅程成員（僅在有指定時檢查，避免勾選等熱路徑多一次查詢）。 */
async function assigneeIsMember(tripId: string, assigneeId: string): Promise<boolean> {
  const trip = await Trip.findById(tripId).select('members').lean<{
    members: { user: { toString(): string } }[];
  } | null>();
  return (trip?.members || []).some((m) => m.user.toString() === assigneeId);
}

/** 取得旅程的所有清單。 */
export const getChecklists = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<ChecklistDto[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const lists = await Checklist.find({ trip: membership.tripId })
        .sort({ createdAt: 1 })
        .populate(ITEM_POPULATE)
        .lean<ChecklistDtoInput[]>();

      return { success: true, data: lists.map(toChecklistDto) };
    } catch (error) {
      logger.error('Get checklists error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 建立一份清單（空項目）。 */
export const createChecklist = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: CreateChecklistInput
  ): Promise<ActionResult<ChecklistDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = createChecklistSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const created = await Checklist.create({
        trip: membership.tripId,
        title: validation.data.title,
        items: [],
        createdBy: session.userId,
      });

      revalidatePath(`/trips/${tripIdOrCode}/checklists`);
      return {
        success: true,
        data: toChecklistDto(created.toObject() as unknown as ChecklistDtoInput),
      };
    } catch (error) {
      logger.error('Create checklist error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 一次帶項目建立清單（範本 / 從其他旅程複製）。只寫入項目文字，勾選一律 false、不帶指派
 * （指派是本旅程成員專屬，跨旅程複製不搬）。單一 create 寫入，比逐項 addChecklistItem 省來回。
 */
export const createChecklistWithItems = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: CreateChecklistWithItemsInput
  ): Promise<ActionResult<ChecklistDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = createChecklistWithItemsSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const created = await Checklist.create({
        trip: membership.tripId,
        title: validation.data.title,
        items: validation.data.items.map((text) => ({ text, done: false, assignee: null })),
        createdBy: session.userId,
      });

      revalidatePath(`/trips/${tripIdOrCode}/checklists`);
      return {
        success: true,
        data: toChecklistDto(created.toObject() as unknown as ChecklistDtoInput),
      };
    } catch (error) {
      logger.error('Create checklist with items error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 「從其他旅程複製」的可選來源：使用者其他旅程裡非空的清單（只回標題 + 項目文字）。 */
export interface CopyableChecklistSource {
  trip_id: string;
  trip_name: string;
  lists: { title: string; items: string[] }[];
}

/**
 * 列出可複製的清單來源：使用者參與、且**排除目前這趟**的旅程中，所有非空清單。
 * 供新增清單面板的「從其他旅程複製」用，回傳項目文字讓前端直接預覽數量並複製。
 */
export const getCopyableChecklists = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<CopyableChecklistSource[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      // 使用者參與的其他旅程（排除目前這趟）。
      const trips = await Trip.find({
        'members.user': session.userId,
        _id: { $ne: membership.tripId },
      })
        .select('name')
        .sort({ updatedAt: -1 })
        .lean<{ _id: { toString(): string }; name: string }[]>();

      if (trips.length === 0) return { success: true, data: [] };

      const tripIds = trips.map((tr) => tr._id.toString());
      const lists = await Checklist.find({ trip: { $in: tripIds } })
        .select('trip title items.text')
        .lean<
          {
            trip: { toString(): string };
            title: string;
            items: { text: string }[];
          }[]
        >();

      const byTrip = new Map<string, CopyableChecklistSource['lists']>();
      for (const l of lists) {
        const items = (l.items || []).map((i) => i.text).filter(Boolean);
        if (items.length === 0) continue; // 空清單不值得複製
        const key = l.trip.toString();
        const arr = byTrip.get(key) ?? [];
        arr.push({ title: l.title, items });
        byTrip.set(key, arr);
      }

      const data: CopyableChecklistSource[] = trips
        .map((tr) => ({
          trip_id: tr._id.toString(),
          trip_name: tr.name,
          lists: byTrip.get(tr._id.toString()) ?? [],
        }))
        .filter((t) => t.lists.length > 0);

      return { success: true, data };
    } catch (error) {
      logger.error('Get copyable checklists error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 重新命名清單。 */
export const updateChecklist = withAuth(
  async (
    session,
    tripIdOrCode: string,
    checklistId: string,
    input: UpdateChecklistInput
  ): Promise<ActionResult<ChecklistDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = updateChecklistSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const res = await Checklist.updateOne(
        { _id: checklistId, trip: membership.tripId },
        { $set: { title: validation.data.title } }
      );
      if (res.matchedCount === 0) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const dto = await findChecklistDto(checklistId, membership.tripId);
      if (!dto) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };

      revalidatePath(`/trips/${tripIdOrCode}/checklists`);
      return { success: true, data: dto };
    } catch (error) {
      logger.error('Update checklist error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 刪除整份清單。 */
export const deleteChecklist = withAuth(
  async (
    session,
    tripIdOrCode: string,
    checklistId: string
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      await Checklist.deleteOne({ _id: checklistId, trip: membership.tripId });

      revalidatePath(`/trips/${tripIdOrCode}/checklists`);
      return { success: true, data: { message: '清單已刪除' } };
    } catch (error) {
      logger.error('Delete checklist error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 新增一個項目到清單。 */
export const addChecklistItem = withAuth(
  async (
    session,
    tripIdOrCode: string,
    checklistId: string,
    input: AddChecklistItemInput
  ): Promise<ActionResult<ChecklistDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = addChecklistItemSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { text, assignee_id } = validation.data;
      if (assignee_id && !(await assigneeIsMember(membership.tripId, assignee_id))) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const res = await Checklist.updateOne(
        { _id: checklistId, trip: membership.tripId },
        { $push: { items: { text, done: false, assignee: assignee_id ?? null } } }
      );
      if (res.matchedCount === 0) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const dto = await findChecklistDto(checklistId, membership.tripId);
      if (!dto) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };

      revalidatePath(`/trips/${tripIdOrCode}/checklists`);
      return { success: true, data: dto };
    } catch (error) {
      logger.error('Add checklist item error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 更新一個項目（勾選 / 改文字 / 指派）。以 arrayFilters 定位 item，避免改寫整個陣列。 */
export const updateChecklistItem = withAuth(
  async (
    session,
    tripIdOrCode: string,
    checklistId: string,
    itemId: string,
    input: UpdateChecklistItemInput
  ): Promise<ActionResult<ChecklistDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = updateChecklistItemSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { text, done, assignee_id } = validation.data;
      if (assignee_id && !(await assigneeIsMember(membership.tripId, assignee_id))) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const set: Record<string, unknown> = {};
      if (text !== undefined) set['items.$[el].text'] = text;
      if (done !== undefined) set['items.$[el].done'] = done;
      // assignee_id 可被設為 null 以清除指派；只要欄位有出現就寫入。
      if (assignee_id !== undefined) set['items.$[el].assignee'] = assignee_id;

      const res = await Checklist.updateOne(
        { _id: checklistId, trip: membership.tripId },
        { $set: set },
        { arrayFilters: [{ 'el._id': itemId }] }
      );
      if (res.matchedCount === 0) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const dto = await findChecklistDto(checklistId, membership.tripId);
      if (!dto) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };

      revalidatePath(`/trips/${tripIdOrCode}/checklists`);
      return { success: true, data: dto };
    } catch (error) {
      logger.error('Update checklist item error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 刪除一個項目。 */
export const removeChecklistItem = withAuth(
  async (
    session,
    tripIdOrCode: string,
    checklistId: string,
    itemId: string
  ): Promise<ActionResult<ChecklistDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const res = await Checklist.updateOne(
        { _id: checklistId, trip: membership.tripId },
        { $pull: { items: { _id: itemId } } }
      );
      if (res.matchedCount === 0) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const dto = await findChecklistDto(checklistId, membership.tripId);
      if (!dto) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };

      revalidatePath(`/trips/${tripIdOrCode}/checklists`);
      return { success: true, data: dto };
    } catch (error) {
      logger.error('Remove checklist item error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
