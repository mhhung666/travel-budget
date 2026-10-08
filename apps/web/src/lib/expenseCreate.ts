import { isSupportedCurrency } from '@/constants/currencies';
import {
  ledgerStamp,
  ledgerMismatch,
  isLedgerV2,
  currentLedger,
  LedgerError,
  parseLedgerInput,
} from './ledger';
import mongoose, { Types, type mongo } from 'mongoose';
import { MAX_EXPENSE_AMOUNT, isCentShare } from '@travel-budget/contracts';
import { assertBlobsAvailable } from '@/lib/blobReferences';
import { allocateMoney, roundMoney, SPLIT_TOLERANCE } from '@/lib/money';
import { readExpenseCreateResult, withExpenseCreateRequest } from '@/lib/expenseCreateRequest';
import { withTripWrite, TripWriteError } from '@/lib/tripWriteTransaction';
import { Expense, Trip, User, ItineraryDay, EXPENSE_CATEGORIES } from '@/models';
import { createExpenseSchema, type CreateExpenseInput } from '@/lib/validation';
import type { Expense as ExpenseDto } from '@/types';
import { logger } from '@/lib/logger';
import { toExpenseDto, type ExpenseDtoInput } from '@/lib/dto';
import { isReceiptKeyForTrip, RECEIPT_CONTENT_TYPES, MAX_RECEIPT_BYTES } from '@/lib/uploads';
import { headObject } from '@/lib/storage';
import { notify } from '@/lib/notify';
import { logActivity } from '@/lib/activity';
import {
  prepareExpenseBackgroundWrite,
  runExpenseBackgroundDelivery,
} from '@/lib/expenseDeliveryRuntime';
import { createExpenseDeliveryEvent } from '@/lib/expenseDeliveryEvent';
import { initialExpenseDeliveryState } from '@/lib/expenseDeliveryQueue';
import { isCalendarDate } from '@/lib/itineraryDayTarget';

/**
 * Expense creation shared by the Web Server Action and the native HTTP adapter.
 *
 * Adapters own authentication, resolving the trip, input parsing and everything that belongs to
 * their runtime (cache invalidation, response mapping). This module owns the business write: the
 * in-transaction membership fence, member/split/amount validation, the idempotency receipt that
 * commits atomically with the expense, and the notification / activity / outbox side effects.
 * It must stay free of `next/*` imports; scheduling after the response is injected.
 */

type LeanExpense = ExpenseDtoInput & { date: Date };

/**
 * Whether split shares (TWD) add up to the expense amount, within one cent.
 * 通過之後一律走 {@link allocateShares} 把尾差分配掉，寫進 DB 的分攤才會剛好加總。
 */
export function splitsMatchAmount(splits: { share_amount: number }[], amount: number): boolean {
  const sum = splits.reduce((acc, sp) => acc + sp.share_amount, 0);
  // 與前端 computeSplits 共用同一個容差與比較方式（lib/money.ts）：先收斂到分，
  // 只吸收小數位誤差。容差不隨金額放大——曾寬到 1 TWD／1%，後來的萬分之一也還是
  // 讓 1,000 元只分攤 999.95 元寫入，結算就留下無人可還的餘額。
  return Math.abs(roundMoney(sum - amount)) <= SPLIT_TOLERANCE;
}

/**
 * 把通過 {@link splitsMatchAmount} 的分攤收斂到分，並把尾差實際分配掉，使加總
 * 「剛好」等於支出金額。
 *
 * 各自四捨五入是不夠的：500＋499.99 各自取整後仍是 999.99，1,000 元的支出就永遠
 * 留下一分無人可還；5.005＋5.005 各自進位則變成 10.02，比支出還多。此時差額必定
 * 在一分內（否則前面已擋下），因此重分配動到任何人的金額都不超過一分。
 * 與前端 computeSplits 使用同一個 allocateMoney，兩邊算出的分攤一致。
 */
export function allocateShares(splits: { share_amount: number }[], amount: number): number[] {
  return allocateMoney(
    amount,
    splits.map((sp) => sp.share_amount)
  );
}

/**
 * 驗證關聯行程日（可複選）全部屬於本 trip——比照 payer/split 須為本 trip 成員的歸屬
 * 檢查，防止把支出指向別團的行程日。空/undefined（不關聯）一律通過。去重後以單一
 * countDocuments 比對數量，避免逐筆查詢。
 */
export async function itineraryDaysBelongToTrip(
  tripId: string,
  dayIds: string[] | null | undefined,
  transactionSession: mongo.ClientSession
): Promise<boolean> {
  const unique = [...new Set(dayIds ?? [])];
  if (unique.length === 0) return true;
  const count = await ItineraryDay.countDocuments({ _id: { $in: unique }, trip: tripId }).session(
    transactionSession
  );
  return count === unique.length;
}

export type AttachmentDoc = {
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
export async function resolveAttachments(
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

/** The entered amount is stored as is, so its cents must at least stay a safe integer. */
const centsAreSafe = (amount: number) => Number.isSafeInteger(Math.round(amount * 100));

/**
 * Rules the input schema cannot express and no caller may skip. V8 rolls `2026-02-31` over to
 * March 3 instead of rejecting it, so the date must be checked as a calendar date.
 */
function assertWritable(input: CreateExpenseInput, amount: number) {
  if (
    isLedgerV2() &&
    (!isSupportedCurrency(input.currency) || input.splits.some((s) => !isCentShare(s.share_amount)))
  )
    throw new TripWriteError('VALIDATION_ERROR');
  if (!isCalendarDate(input.date)) throw new TripWriteError('VALIDATION_ERROR');
  if (
    !centsAreSafe(input.original_amount) ||
    (isLedgerV2() && roundMoney(input.original_amount) !== input.original_amount)
  )
    throw new TripWriteError('VALIDATION_ERROR');
  // The TWD amount and shares are what gets summed, compared and rounded again on every read.
  // Beyond MAX_EXPENSE_AMOUNT the shared rounding stops returning cent values unchanged, so the
  // stored amount and shares would no longer be the ones the caller confirmed. A product that
  // overflows would otherwise be rounded to 0.
  if (
    !Number.isFinite(input.original_amount * input.exchange_rate) ||
    amount > MAX_EXPENSE_AMOUNT ||
    input.splits.some((split) => split.share_amount > MAX_EXPENSE_AMOUNT)
  ) {
    throw new TripWriteError('VALIDATION_ERROR');
  }
  const members = input.splits.map((split) => split.user_id);
  if (new Set(members).size !== members.length) throw new TripWriteError('VALIDATION_ERROR');
}

export interface CreateExpenseCommand {
  /** Canonical trip ObjectId that the adapter has already authorized `actorId` for. */
  tripId: string;
  actorId: string;
  /** Output of `createExpenseSchema`: stable field order and defaults feed the request fingerprint. */
  input: CreateExpenseInput;
}
/** Runs work after the response is sent; owned by the adapter's runtime (Next.js `after`). */
export type AfterResponse = (task: () => Promise<void>) => void;
export type CreateExpenseResult = { replayed: boolean; data: ExpenseDto };

/**
 * Commits one expense for an authorized actor. A repeated `client_request_id` returns the accepted
 * result without writing again or repeating any side effect (the receipt is read again inside the
 * transaction, so concurrent duplicates also collapse into one). Throws {@link TripWriteError}
 * (or `RetiredBlobError`) for rejected input; any other error means the outcome is unknown.
 * Once the transaction has committed, nothing after it can throw: side-effect failures are logged.
 */
export async function createExpenseForActor(
  { tripId, actorId, input }: CreateExpenseCommand,
  afterResponse: AfterResponse
): Promise<CreateExpenseResult> {
  if (isLedgerV2()) {
    input = parseLedgerInput(createExpenseSchema, input);
    if (!input.base_currency) throw new TripWriteError('VALIDATION_ERROR');
  }
  if (!isLedgerV2() && input.base_currency && input.base_currency !== 'TWD')
    throw new TripWriteError('VALIDATION_ERROR');
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
  } = input;

  const request = { tripId, actorId, input };
  // Replays must not depend on attachments or members that may have changed since commit.
  const previous = await readExpenseCreateResult(mongoose.connection.db!, request);
  if (previous) return { replayed: true, data: previous };
  // 換算後先收斂到分再寫入：30.004 這種未取整的金額會讓統計（逐筆取整）與
  // 結算（加總後取整）在同一趟旅行算出 60 與 60.01 兩個數字。
  const amount = roundMoney(original_amount * exchange_rate);
  if (!isLedgerV2()) assertWritable(input, amount);

  // 驗證並轉換收據附件（key 須屬本 trip、物件須存在、size/type 以 headObject 為準）
  let attachmentDocs: AttachmentDoc[] = [];
  let attachmentsValid = true;
  if (attachments && attachments.length > 0) {
    const resolved = await resolveAttachments(tripId, actorId, attachments);
    if (!resolved && !isLedgerV2()) throw new TripWriteError('VALIDATION_ERROR');
    attachmentsValid = resolved !== null;
    attachmentDocs = resolved ?? [];
  }

  const background = await prepareExpenseBackgroundWrite();
  const result = await withTripWrite(tripId, actorId, async (transactionSession) => {
    return withExpenseCreateRequest(
      mongoose.connection.db!,
      transactionSession,
      request,
      async () => {
        if (ledgerMismatch()) return { rejected: 'LEDGER_CURRENCY_MISMATCH' as const };
        let trip;
        let memberIds: Set<string>;
        let shareAmounts: number[];
        try {
          assertWritable(input, amount);
          if (!attachmentsValid) throw new TripWriteError('VALIDATION_ERROR');
          if (
            isLedgerV2() &&
            input.currency === currentLedger().baseCurrency &&
            input.exchange_rate !== 1
          )
            throw new TripWriteError('VALIDATION_ERROR');
          // Validate payer and split members are trip members
          trip = await Trip.findById(tripId)
            .session(transactionSession)
            .select('name hashCode members expenseDeliveryDeleting')
            .lean<{
              name: string;
              hashCode: string;
              members: { user: { toString(): string } }[];
              expenseDeliveryDeleting?: boolean;
            }>();
          if (!trip || trip.expenseDeliveryDeleting) {
            throw new TripWriteError('NOT_FOUND');
          }
          memberIds = new Set((trip?.members || []).map((m) => m.user.toString()));

          if (!memberIds.has(payer_id)) {
            throw new TripWriteError('VALIDATION_ERROR');
          }
          for (const split of splits) {
            if (!memberIds.has(split.user_id)) {
              throw new TripWriteError('VALIDATION_ERROR');
            }
          }

          // Split shares (TWD) must add up to the expense amount. The form already
          // allocates the remainder exactly; the tolerance here only absorbs decimal
          // rounding, so an unallocated gap can no longer reach the database.
          if (!splitsMatchAmount(splits, amount)) {
            throw new TripWriteError('VALIDATION_ERROR');
          }
          shareAmounts = allocateShares(splits, amount);

          // 關聯行程日（可複選，若有）須全部屬本 trip
          if (!(await itineraryDaysBelongToTrip(tripId, itinerary_day_ids, transactionSession))) {
            throw new TripWriteError('VALIDATION_ERROR');
          }
        } catch (error) {
          // Only known business validation before any expense/blob write is terminal. Unknown DB,
          // storage and transaction errors still abort, and cannot erase an ambiguous earlier write.
          if (
            !isLedgerV2() ||
            !(error instanceof TripWriteError) ||
            error.code !== 'VALIDATION_ERROR'
          )
            throw error;
          return { rejected: error.code };
        }
        const expenseId = new Types.ObjectId();
        // Resolve response names and immutable actor name BEFORE the insert. No post-write populate
        // can fail and misrepresent an already committed expense as a failed creation.
        const people = await User.find({
          _id: {
            $in: [...new Set([actorId, payer_id, ...splits.map((split) => split.user_id)])],
          },
        })
          .session(transactionSession)
          .select('username displayName')
          .lean<
            {
              _id: Types.ObjectId;
              username: string;
              displayName: string;
            }[]
          >();
        const byId = new Map(people.map((person) => [person._id.toString(), person]));
        const eventSnapshot = background
          ? createExpenseDeliveryEvent({
              expenseId: expenseId.toHexString(),
              tripId,
              actorId,
              actorName: byId.get(actorId)?.displayName ?? '',
              tripName: trip.name,
              tripHashCode: trip.hashCode,
              memberIds: [...memberIds],
              description,
              amount,
              baseCurrency: ledgerStamp().baseCurrency,
              occurredAt: new Date(),
            })
          : undefined;
        await assertBlobsAvailable(
          mongoose.connection.db!,
          transactionSession,
          attachmentDocs.map((a) => a.key)
        );
        const [created] = await Expense.create(
          [
            {
              ...(background
                ? {
                    _id: expenseId,
                    expenseDelivery: initialExpenseDeliveryState(),
                    expenseDeliveryEvent: eventSnapshot,
                  }
                : {}),
              ...ledgerStamp(),
              trip: tripId,
              payer: payer_id,
              amount,
              originalAmount: original_amount,
              currency,
              exchangeRate: exchange_rate,
              description,
              category: category as (typeof EXPENSE_CATEGORIES)[number],
              date: new Date(date),
              splits: splits.map((s, i) => ({
                user: s.user_id,
                shareAmount: shareAmounts[i],
              })),
              attachments: attachmentDocs,
              itineraryDays: [...new Set(itinerary_day_ids ?? [])],
              createdBy: actorId,
              tags: [...new Set(tags ?? [])],
            },
          ],
          { session: transactionSession }
        );

        const person = (id: string) =>
          byId.get(id) ?? {
            _id: new Types.ObjectId(id),
            username: 'Unknown',
            displayName: 'Unknown',
          };
        const data = toExpenseDto(
          {
            ...created.toObject(),
            payer: person(payer_id),
            splits: splits.map((split, i) => ({
              user: person(split.user_id),
              shareAmount: shareAmounts[i],
            })),
          } as unknown as LeanExpense,
          tripId
        );
        return { data, trip, memberIds };
      }
    );
  });
  if ('rejected' in result && result.rejected) throw new LedgerError(result.rejected);
  if (result.replayed) return { replayed: true, data: result.data };
  const { data, trip, memberIds } = result;

  if (background) {
    try {
      // Platform-supported post-response work; durable recovery never relies on this alone.
      afterResponse(async () => {
        try {
          await runExpenseBackgroundDelivery();
        } catch {
          logger.error('Expense delivery background trigger failed');
        }
      });
    } catch {
      logger.error('Expense delivery background scheduling failed');
    }
    // Never call legacy notify/logActivity for an outbox event (their records have no dedupe key).
    return { replayed: false, data };
  }

  // 副作用互不依賴，並行但仍等待完成（serverless 不使用 fire-and-forget）。
  // 呼叫端再隔離失敗，避免已建立的支出被呈現為失敗而誘發重送。
  const event = {
    tripId,
    actorId,
    type: 'expense_added' as const,
    meta: { expense_id: data.id, description, amount, baseCurrency: ledgerStamp().baseCurrency },
  };
  const effects = await Promise.allSettled([
    Promise.resolve().then(() =>
      notify({
        ...event,
        tripSnapshot: trip
          ? { id: tripId, name: trip.name, hashCode: trip.hashCode, memberIds: [...memberIds] }
          : undefined,
      })
    ),
    Promise.resolve().then(() => logActivity(event)),
  ]);
  effects.forEach((outcome, index) => {
    if (outcome.status === 'rejected') {
      logger.error(
        `Create expense ${index === 0 ? 'notification' : 'activity'} failed`,
        outcome.reason
      );
    }
  });
  return { replayed: false, data };
}
