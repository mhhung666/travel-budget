'use server';

import { isValidObjectId, Types } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { LoyaltyAccount, LoyaltyEntry, FlightRecord } from '@/models';
import type { LoyaltyAccountDoc, LoyaltyEntryDoc } from '@/models';
import {
  upsertLoyaltyAccountSchema,
  createLoyaltyEntrySchema,
  updateLoyaltyEntrySchema,
  type UpsertLoyaltyAccountInput,
  type CreateLoyaltyEntryInput,
} from '@/lib/validation';
import { programTierKeys, type LoyaltyProgram } from '@/constants/loyalty';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { LoyaltyData, LoyaltyAccountItem, LoyaltyEntryItem } from '@/types';
import { logger } from '@/lib/logger';

/**
 * 會籍積分與里程紀錄（docs/PLAN-LOYALTY.md）：帳戶＋ledger 的 CRUD 與總覽。
 *
 * 與旅行成就（collection.actions.ts）同屬 user-level 個人資料——只驗 session、
 * 以 `{ _id, user }` 條件式原子更新/刪除保證只有本人可動。**不進任何公開分享路由**
 * （會籍屬敏感個資，連彙總數字都不進公開收藏牆）。
 *
 * 積分/里數數字由使用者手動記，app 不計算不判級（進度對照在前端 lib/loyalty.ts）。
 */

type LeanAccount = { _id: Types.ObjectId; createdAt: Date } & Omit<LoyaltyAccountDoc, 'user'>;
type LeanEntry = {
  _id: Types.ObjectId;
  flightRecord: Types.ObjectId | null;
  createdAt: Date;
} & Omit<LoyaltyEntryDoc, 'user' | 'flightRecord'>;

const toYmd = (d: Date): string => new Date(d).toISOString().slice(0, 10);

function toAccountItem(doc: LeanAccount): LoyaltyAccountItem {
  return {
    id: doc._id.toString(),
    program: doc.program as LoyaltyProgram,
    current_tier: doc.currentTier,
    tier_started_at: doc.tierStartedAt ? toYmd(doc.tierStartedAt) : null,
    tier_expires_at: doc.tierExpiresAt ? toYmd(doc.tierExpiresAt) : null,
    member_no: doc.memberNo ?? '',
    note: doc.note ?? '',
    created_at: doc.createdAt.toISOString(),
  };
}

function toEntryItem(doc: LeanEntry): LoyaltyEntryItem {
  return {
    id: doc._id.toString(),
    program: doc.program as LoyaltyProgram,
    date: toYmd(doc.date),
    type: doc.type,
    status_points: doc.statusPoints ?? 0,
    qualifying_miles: doc.qualifyingMiles ?? 0,
    award_miles: doc.awardMiles ?? 0,
    own_airline: doc.ownAirline ?? false,
    flight_record_id: doc.flightRecord ? doc.flightRecord.toString() : null,
    note: doc.note ?? '',
    created_at: doc.createdAt.toISOString(),
  };
}

/**
 * 驗證「來源飛行紀錄」（帶入防偽造＋防重複）：紀錄必須是本人的；同一筆飛行紀錄
 * 在同一 program 只能帶入一次（excludeEntryId＝更新時排除自己）。
 * 回傳錯誤碼或 null（通過）。
 */
async function validateFlightLink(
  userId: string,
  program: LoyaltyProgram,
  flightRecordId: string | null | undefined,
  excludeEntryId?: string
): Promise<'NOT_FOUND' | 'CONFLICT' | null> {
  if (!flightRecordId) return null;
  const owned = await FlightRecord.exists({ _id: flightRecordId, user: userId });
  if (!owned) return 'NOT_FOUND';
  const dup = await LoyaltyEntry.exists({
    user: userId,
    program,
    flightRecord: flightRecordId,
    ...(excludeEntryId ? { _id: { $ne: excludeEntryId } } : {}),
  });
  return dup ? 'CONFLICT' : null;
}

/** 會籍總覽：我的全部帳戶＋全部 entries（新到舊）。個人資料量小，一支查詢餵整個 tab。 */
export const getLoyalty = withAuth(async (session): Promise<ActionResult<LoyaltyData>> => {
  try {
    await dbConnect();

    const [accounts, entries] = await Promise.all([
      LoyaltyAccount.find({ user: session.userId }).sort({ createdAt: 1 }).lean<LeanAccount[]>(),
      LoyaltyEntry.find({ user: session.userId }).sort({ date: -1, _id: -1 }).lean<LeanEntry[]>(),
    ]);

    return {
      success: true,
      data: { accounts: accounts.map(toAccountItem), entries: entries.map(toEntryItem) },
    };
  } catch (error) {
    logger.error('Get loyalty error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
});

/** 建立或更新會籍帳戶（一人一 program 一筆，整筆覆寫語意）。 */
export const upsertLoyaltyAccount = withAuth(
  async (session, input: UpsertLoyaltyAccountInput): Promise<ActionResult<LoyaltyAccountItem>> => {
    try {
      const parsed = upsertLoyaltyAccountSchema.safeParse(input);
      if (
        !parsed.success ||
        !programTierKeys(parsed.data.program).includes(parsed.data.current_tier)
      ) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      await dbConnect();

      const doc = await LoyaltyAccount.findOneAndUpdate(
        { user: session.userId, program: parsed.data.program },
        {
          $set: {
            currentTier: parsed.data.current_tier,
            tierStartedAt: parsed.data.tier_started_at
              ? new Date(parsed.data.tier_started_at)
              : null,
            tierExpiresAt: parsed.data.tier_expires_at
              ? new Date(parsed.data.tier_expires_at)
              : null,
            memberNo: parsed.data.member_no,
            note: parsed.data.note,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean<LeanAccount>();

      return { success: true, data: toAccountItem(doc!) };
    } catch (error) {
      logger.error('Upsert loyalty account error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 刪除會籍帳戶＝連同該 program 的全部 entries（手動級聯，無 FK cascade）。 */
export const deleteLoyaltyAccount = withAuth(
  async (session, accountId: string): Promise<ActionResult<{ deleted: true }>> => {
    try {
      if (!isValidObjectId(accountId)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      await dbConnect();

      const account = await LoyaltyAccount.findOneAndDelete({
        _id: accountId,
        user: session.userId,
      }).lean<LeanAccount | null>();
      if (!account) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      await LoyaltyEntry.deleteMany({ user: session.userId, program: account.program });

      return { success: true, data: { deleted: true } };
    } catch (error) {
      logger.error('Delete loyalty account error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

function entryFields(input: CreateLoyaltyEntryInput) {
  return {
    program: input.program,
    date: new Date(input.date),
    type: input.type,
    statusPoints: input.status_points,
    qualifyingMiles: input.qualifying_miles,
    awardMiles: input.award_miles,
    ownAirline: input.own_airline,
    flightRecord: input.flight_record_id ?? null,
    note: input.note,
  };
}

export const createLoyaltyEntry = withAuth(
  async (session, input: CreateLoyaltyEntryInput): Promise<ActionResult<LoyaltyEntryItem>> => {
    try {
      const parsed = createLoyaltyEntrySchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      await dbConnect();

      // entries 必須掛在已設定的帳戶下（先設帳戶再記帳，UI 同此順序）
      const hasAccount = await LoyaltyAccount.exists({
        user: session.userId,
        program: parsed.data.program,
      });
      if (!hasAccount) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const linkError = await validateFlightLink(
        session.userId,
        parsed.data.program,
        parsed.data.flight_record_id
      );
      if (linkError) {
        return { success: false, error: linkError, code: linkError };
      }

      const doc = await LoyaltyEntry.create({
        user: session.userId,
        ...entryFields(parsed.data),
      });

      return { success: true, data: toEntryItem(doc.toObject() as LeanEntry) };
    } catch (error) {
      logger.error('Create loyalty entry error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

export const updateLoyaltyEntry = withAuth(
  async (
    session,
    entryId: string,
    input: CreateLoyaltyEntryInput
  ): Promise<ActionResult<LoyaltyEntryItem>> => {
    try {
      if (!isValidObjectId(entryId)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const parsed = updateLoyaltyEntrySchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      await dbConnect();

      const linkError = await validateFlightLink(
        session.userId,
        parsed.data.program,
        parsed.data.flight_record_id,
        entryId
      );
      if (linkError) {
        return { success: false, error: linkError, code: linkError };
      }

      // 原子更新：filter 同時帶 _id + 本人（比照旅行成就，不做讀改寫）。
      // program 沿用建立時的值不可改（filter 帶入，避免 entry 被搬到另一帳戶下）。
      const updated = await LoyaltyEntry.findOneAndUpdate(
        { _id: entryId, user: session.userId, program: parsed.data.program },
        { $set: entryFields(parsed.data) },
        { new: true }
      ).lean<LeanEntry | null>();
      if (!updated) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      return { success: true, data: toEntryItem(updated) };
    } catch (error) {
      logger.error('Update loyalty entry error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

export const deleteLoyaltyEntry = withAuth(
  async (session, entryId: string): Promise<ActionResult<{ deleted: true }>> => {
    try {
      if (!isValidObjectId(entryId)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      await dbConnect();

      const result = await LoyaltyEntry.deleteOne({ _id: entryId, user: session.userId });
      if (result.deletedCount === 0) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      return { success: true, data: { deleted: true } };
    } catch (error) {
      logger.error('Delete loyalty entry error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
