import { assertBlobsAvailable } from './blobReferences';
import { mongo } from 'mongoose';
import { ItineraryDay } from '@/models';
import { rebindAutoPhotosInTransaction } from '@/lib/photoItineraryTransaction';
import {
  dayNumberForDate,
  isDateWithinTrip,
  MAX_ITINERARY_DAY_NUMBER,
  toDateOnly,
} from '@/lib/itineraryDayTarget';
import type { ItineraryDayTargetInput } from '@/lib/validation';

export type ItineraryDayCreationErrorCode =
  | 'FORBIDDEN'
  | 'TRIP_DATES_CHANGED'
  | 'DAY_ALREADY_EXISTS'
  | 'DATE_OUTSIDE_TRIP'
  | 'TRIP_START_DATE_REQUIRED'
  | 'VALIDATION_ERROR';

export class ItineraryDayCreationError extends Error {
  constructor(public readonly code: ItineraryDayCreationErrorCode) {
    super(code);
  }
}

/**
 * 依目標算出權威 dayNumber。前端預覽一律不採信：起訖以交易內讀到的旅程為準，
 * 與表單開啟時的 expected 值不同就中止，讓使用者重新確認日期。
 */
function resolveDayNumber(
  target: ItineraryDayTargetInput,
  trip: { startDate?: Date | string | null; endDate?: Date | string | null }
): number {
  const startDate = toDateOnly(trip.startDate);
  const endDate = toDateOnly(trip.endDate);
  if ('date' in target) {
    if (!startDate) throw new ItineraryDayCreationError('TRIP_START_DATE_REQUIRED');
    if (startDate !== target.expected_start_date || endDate !== target.expected_end_date) {
      throw new ItineraryDayCreationError('TRIP_DATES_CHANGED');
    }
    if (!isDateWithinTrip(target.date, startDate, endDate)) {
      throw new ItineraryDayCreationError('DATE_OUTSIDE_TRIP');
    }
    return dayNumberForDate(startDate, target.date);
  }
  // 「第幾天」只在旅程沒有開始日時合法；期間被補上開始日就得回表單重選日期。
  if (startDate || endDate !== target.expected_end_date) {
    throw new ItineraryDayCreationError('TRIP_DATES_CHANGED');
  }
  return target.day_number;
}

/** Attachment HEAD checks must finish before entering this retryable transaction. */
export async function createItineraryDayAtomically(
  db: mongo.Db,
  tripId: string,
  actorId: string,
  input: {
    title: string;
    content: string;
    location: unknown;
    activities: Record<string, unknown>[];
    /** 省略＝尚未更新的舊頁面，沿用接在最後一天（仍驗證旅程範圍）。 */
    target?: ItineraryDayTargetInput;
  }
) {
  const trip = new mongo.ObjectId(tripId);
  const { target, ...dayInput } = input;
  return db.client.withSession((session) =>
    session.withTransaction(
      async () => {
        const parent = await db.collection('trips').findOneAndUpdate(
          {
            _id: trip,
            members: { $elemMatch: { user: new mongo.ObjectId(actorId), role: 'admin' } },
            expenseDeliveryDeleting: { $ne: true },
          },
          { $inc: { expenseDeliveryFence: 1 } },
          { session }
        );
        if (!parent) throw new ItineraryDayCreationError('FORBIDDEN');

        let dayNumber: number;
        if (target) {
          dayNumber = resolveDayNumber(
            target,
            parent as { startDate?: Date | null; endDate?: Date | null }
          );
        } else {
          const last = await db
            .collection('itinerarydays')
            .findOne({ trip }, { session, sort: { dayNumber: -1 }, projection: { dayNumber: 1 } });
          dayNumber = (last?.dayNumber ?? 0) + 1;
          const startDate = toDateOnly(parent.startDate);
          const endDate = toDateOnly(parent.endDate);
          // 舊輸入同樣受範圍限制，避免兩個入口的規則分歧。
          if (startDate && endDate && dayNumberForDate(startDate, endDate) < dayNumber) {
            throw new ItineraryDayCreationError('DATE_OUTSIDE_TRIP');
          }
        }
        if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > MAX_ITINERARY_DAY_NUMBER) {
          throw new ItineraryDayCreationError('VALIDATION_ERROR');
        }

        const taken = await db
          .collection('itinerarydays')
          .findOne({ trip, dayNumber }, { session, projection: { _id: 1 } });
        if (taken) throw new ItineraryDayCreationError('DAY_ALREADY_EXISTS');

        // Construct anew on retries; retain Mongoose casting, validation and subdocument defaults.
        const created = new ItineraryDay({ ...dayInput, trip, dayNumber });
        await assertBlobsAvailable(
          db,
          session,
          created.activities.flatMap((a) => (a.attachments ?? []).map((at) => at.key))
        );
        try {
          await created.save({ session });
        } catch (error) {
          // 兩位管理員同時新增同一天：唯一索引是最後防線，轉成可辨識的提示。
          if ((error as { code?: number }).code === 11000) {
            throw new ItineraryDayCreationError('DAY_ALREADY_EXISTS');
          }
          throw error;
        }
        await rebindAutoPhotosInTransaction(
          db,
          session,
          trip,
          { startDate: parent.startDate, endDate: parent.endDate },
          new Date()
        );
        return created.toObject();
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        timeoutMS: 20_000,
      }
    )
  );
}
