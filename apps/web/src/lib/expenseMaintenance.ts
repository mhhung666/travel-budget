import { z } from 'zod';
import { getEnv } from '@/lib/env';
import type { LedgerMutationRequest } from '@travel-budget/contracts';
import {
  parseLedgerInput,
  ledgerFingerprint,
  receiptStamp,
  terminalWithLedger,
  checkReceiptVersion,
  ledgerMismatch,
  authorizeLedger,
  ledgerStamp,
  assertUnit,
  currentLedger,
  LedgerError,
} from './ledger';
import { assertBlobsAvailable, RetiredBlobError } from '@/lib/blobReferences';
import { allocateMoney, roundMoney } from '@/lib/money';
import {
  allocateShares,
  itineraryDaysBelongToTrip,
  resolveAttachments,
  splitsMatchAmount,
} from '@/lib/expenseCreate';
import { Expense, Trip, Comment } from '@/models';
import { updateExpenseSchema, type UpdateExpenseInput } from '@/lib/validation';
import type { ActionResult } from '@/actions/types';
import { logger } from '@/lib/logger';
import { createHash, createHmac } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import {
  expenseCategories,
  expenseEditContextSchema,
  expenseUpdateInput,
  expenseDeleteInput,
  expenseCreateInput,
  MAX_EXPENSE_AMOUNT,
  isCentShare,
  MAX_EXPENSE_MEMBERS,
  type ExpenseEditContext,
  type ExpenseMutationResult,
  type ExpenseUpdateInput,
  type MutationRequest,
} from '@travel-budget/contracts';
import {
  withTripWrite,
  TripWriteError,
  withTripWriteInDatabase,
  withTripReadInDatabase,
} from './tripWriteTransaction';
import { MUTATION_REQUESTS, TripEntryError } from './tripEntry';
import { getAllCurrencyCodes, isSupportedCurrency } from '@/constants/currencies';
import { computeSplits } from './expenseSplit';
import { retireUnreferencedBlobs } from './blobReferences';
import { cleanupRetiredBlobs } from './blobCleanup';

interface RawExpense extends mongo.Document {
  _id: mongo.ObjectId;
  trip: mongo.ObjectId;
  payer?: mongo.ObjectId;
  amount: number;
  originalAmount?: number;
  exchangeRate?: number;
  currency?: string;
  baseCurrency?: string;
  description: string;
  category?: string;
  date: Date;
  splits?: { user: mongo.ObjectId; shareAmount: number }[];
  attachments?: { key: string }[];
}
interface Parent extends mongo.Document {
  baseCurrency?: string;
  members: { user: mongo.ObjectId; joinedAt?: Date }[];
  currencySettings?: {
    defaultCurrency?: string;
    currencies?: { code: string; rate?: number | null }[];
  } | null;
}
type Terminal = Exclude<MutationRequest | LedgerMutationRequest, { status: 'not_found' }>;
interface Receipt {
  _id: string;
  fingerprint: string;
  contractVersion?: number;
  ledger?: unknown;
  terminal: Terminal;
  createdAt: Date;
}
// Canonicalize raw BSON, including missing vs null; never hash populated or repaired DTOs.
function canonical(value: unknown): unknown {
  if (value === undefined) return { missing: true };
  if (value instanceof Date) return { date: value.toISOString() };
  if (value instanceof mongo.ObjectId) return { id: value.toHexString() };
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  return value;
}
const businessFields = [
  'payer',
  'amount',
  'originalAmount',
  'currency',
  'exchangeRate',
  'description',
  'category',
  'date',
  'splits',
  'attachments',
  'tags',
  'itineraryDays',
] as const;
export function expenseRevision(
  secret: string,
  tripId: string,
  expense: mongo.Document,
  members: unknown[]
) {
  return createHmac('sha256', secret)
    .update(
      JSON.stringify(
        canonical({
          domain: 'expense-maintenance/v1',
          ledger: currentLedger(),
          contractVersion: 2,
          tripId,
          expenseId: expense._id,
          fields: Object.fromEntries(businessFields.map((k) => [k, expense[k]])),
          members,
        })
      )
    )
    .digest('hex');
}
export function webExpenseRevision(
  secret: string,
  tripId: string,
  expense: mongo.Document,
  members: { user: { toString(): string } }[]
) {
  const ref = (value: unknown) =>
    value && typeof value === 'object' && '_id' in value ? (value as { _id: unknown })._id : value;
  return expenseRevision(
    secret,
    tripId,
    {
      ...expense,
      payer: ref(expense.payer),
      splits: (expense.splits ?? []).map((s: { user: unknown; shareAmount: number }) => ({
        ...s,
        user: ref(s.user),
      })),
    },
    members.map((m) => m.user.toString())
  );
}
async function contextInSnapshot(
  db: mongo.Db,
  session: mongo.ClientSession,
  tripId: string,
  expenseId: string,
  secret: string
): Promise<ExpenseEditContext | null> {
  const parent = await db
    .collection<Parent>('trips')
    .findOne({ _id: new mongo.ObjectId(tripId) }, { session });
  const raw = await db
    .collection<RawExpense>('expenses')
    .findOne({ _id: new mongo.ObjectId(expenseId), trip: new mongo.ObjectId(tripId) }, { session });
  if (!raw || !parent) return null;
  const base = authorizeLedger(parent).baseCurrency;
  assertUnit(raw, base);
  const users = await db
    .collection<{ _id: mongo.ObjectId; displayName: string; isVirtual?: boolean }>('users')
    .find(
      {
        _id: {
          $in: [
            ...parent.members.map((m) => m.user),
            ...(raw.payer ? [raw.payer] : []),
            ...(raw.splits ?? []).map((s) => s.user),
          ],
        },
      },
      { session, projection: { displayName: 1, isVirtual: 1 } }
    )
    .toArray();
  const virtual = new Map(users.map((u) => [u._id.toString(), u.isVirtual === true]));
  const names = new Map(users.map((u) => [u._id.toString(), u.displayName]));
  const members = parent.members
    .filter((m) => names.has(m.user.toString()))
    .sort((a, b) =>
      (a.joinedAt?.toISOString() ?? '').localeCompare(b.joinedAt?.toISOString() ?? '')
    )
    .map((m) => ({
      id: m.user.toString(),
      displayName: names.get(m.user.toString())!,
      isVirtual: virtual.get(m.user.toString())!,
    }));
  const known = new Set(members.map((m) => m.id));
  const splits = raw.splits ?? [];
  const currency = raw.currency ?? 'TWD';
  const rate = raw.exchangeRate ?? 1;
  const original = raw.originalAmount ?? raw.amount;
  const selected = new Set(splits.map((s) => s.user?.toString()));
  const validMoney =
    expenseCreateInput.shape.original_amount.safeParse(original).success &&
    roundMoney(original) === original &&
    isSupportedCurrency(currency) &&
    Number.isFinite(rate) &&
    rate > 0 &&
    (currency !== base || rate === 1) &&
    Number.isFinite(original * rate) &&
    roundMoney(original * rate) <= MAX_EXPENSE_AMOUNT &&
    raw.amount === roundMoney(original * rate);
  const validStructure =
    validMoney &&
    raw.originalAmount !== undefined &&
    raw.exchangeRate !== undefined &&
    raw.currency !== undefined &&
    splits.length >= 1 &&
    splits.length <= MAX_EXPENSE_MEMBERS &&
    splits.every((s) => isCentShare(s.shareAmount)) &&
    selected.size === splits.length;
  const validMembers =
    !!raw.payer &&
    known.has(raw.payer.toString()) &&
    splits.every((s) => known.has(s.user?.toString()));
  // The DB has no split-mode field. Only exact equality with the canonical original-currency
  // allocation permits recalculation; arbitrary historical/non-equal shares remain basic-only.
  const equalShares =
    validStructure && validMembers
      ? computeSplits(
          'equal',
          members.map((m) => ({
            id: m.id,
            selected: selected.has(m.id),
            value: '',
          })),
          original,
          rate
        ).twd
      : {};
  const recalculate =
    validStructure &&
    validMembers &&
    splits.every((s) => equalShares[s.user.toString()] === s.shareAmount);
  const reason = recalculate
    ? currency === 'TWD'
      ? null
      : 'foreign'
    : !validStructure
      ? 'historical'
      : !validMembers
        ? 'members'
        : 'historical';
  const member = (id?: mongo.ObjectId) => (id && names.has(id.toString()) ? id.toString() : null);
  return expenseEditContextSchema.parse({
    expense: {
      id: raw._id.toString(),
      description: raw.description,
      date: raw.date.toISOString().slice(0, 10),
      category: expenseCategories.includes(raw.category as (typeof expenseCategories)[number])
        ? raw.category
        : 'other',
      payerId: member(raw.payer),
      payerIsVirtual: raw.payer ? virtual.get(raw.payer.toString()) : undefined,
      payerName: raw.payer ? (names.get(raw.payer.toString()) ?? '') : '',
      amount: raw.amount,
      originalAmount: original,
      currency,
      exchangeRate: rate,
      splits: splits.map((s) => ({
        userId: member(s.user),
        displayName: names.get(s.user?.toString()) ?? '',
        isVirtual: virtual.get(s.user?.toString()),
        shareAmount: s.shareAmount,
      })),
    },
    category: raw.category ?? null,
    options: {
      members,
      categories: [...expenseCategories],
      supportedCurrencies: getAllCurrencyCodes(),
      currencySettings: parent.currencySettings
        ? {
            default_currency: parent.currencySettings.defaultCurrency ?? null,
            currencies: (parent.currencySettings.currencies ?? []).map((c) => ({
              code: c.code,
              rate: c.rate ?? null,
            })),
          }
        : null,
    },
    revision: expenseRevision(secret, tripId, raw, [
      parent.members.map((m) => m.user),
      members.map((m) => m.id),
    ]),
    capabilities: {
      basic: true,
      equal: recalculate,
      recalculate,
      reason,
    },
  });
}
export function readExpenseEditContext(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  expenseId: string,
  secret: string
) {
  return withTripWriteInDatabase(db, tripId, actorId, async (session) => {
    const context = await contextInSnapshot(db, session, tripId, expenseId, secret);
    if (!context) throw new TripEntryError('NOT_FOUND');
    return context;
  });
}
/** Both adapters use a trip-fenced transaction. Terminal refusals and success compete on one UUID. */
export async function maintainExpense(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  expenseId: string,
  operation: 'expense.update' | 'expense.delete',
  body: unknown,
  secret: string,
  cleanup = cleanupRetiredBlobs
): Promise<ExpenseMutationResult> {
  const input =
    operation === 'expense.update'
      ? parseLedgerInput(expenseUpdateInput, body)
      : parseLedgerInput(expenseDeleteInput, body);
  const key = `${actorId.toLowerCase()}:${input.client_request_id}`;
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(canonical(ledgerFingerprint({ operation, tripId, expenseId, input }))))
    .digest('hex');
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const accepted = await withTripWriteInDatabase(db, tripId, actorId, async (session) => {
        const receipts = db.collection<Receipt>(MUTATION_REQUESTS);
        const existing = await receipts.findOne({ _id: key }, { session });
        if (existing) {
          checkReceiptVersion({
            contractVersion: existing.contractVersion,
            ledger: existing.ledger,
          });
          if (existing.fingerprint !== fingerprint)
            throw new TripEntryError('IDEMPOTENCY_CONFLICT');
          return { terminal: existing.terminal, keys: [] as string[] };
        }
        const current = await contextInSnapshot(db, session, tripId, expenseId, secret);
        let terminal: Terminal;
        let keys: string[] = [];
        const reject = (
          code:
            | 'RESOURCE_GONE'
            | 'RESOURCE_CHANGED'
            | 'VALIDATION_ERROR'
            | 'LEDGER_CURRENCY_MISMATCH'
        ): Terminal => ({ status: 'rejected', operation, tripId, code });
        if (ledgerMismatch()) terminal = reject('LEDGER_CURRENCY_MISMATCH');
        else if (!current) terminal = reject('RESOURCE_GONE');
        else if (current.revision !== input.expected_revision)
          terminal = reject('RESOURCE_CHANGED');
        else {
          const filter = { _id: new mongo.ObjectId(expenseId), trip: new mongo.ObjectId(tripId) };
          let set: Record<string, unknown> = {};
          let invalid = false;
          if (operation === 'expense.update') {
            const update = input as ExpenseUpdateInput;
            const { changes } = update;
            if (changes.description !== undefined) set.description = changes.description;
            if (changes.category !== undefined) set.category = changes.category;
            if (changes.date !== undefined) set.date = new Date(changes.date);
            if (update.mode === 'equal') {
              const { original_amount, payer_id, splits } = update.changes;
              const currency = update.changes.currency ?? 'TWD';
              const rate = update.changes.exchange_rate ?? 1;
              const product = original_amount * rate;
              const selected = new Set(splits.map((s) => s.user_id));
              const members = current.options.members;
              const shares =
                isSupportedCurrency(currency) &&
                Number.isFinite(product) &&
                roundMoney(product) <= MAX_EXPENSE_AMOUNT
                  ? computeSplits(
                      'equal',
                      members.map((m) => ({ id: m.id, selected: selected.has(m.id), value: '' })),
                      original_amount,
                      rate
                    ).twd
                  : {};
              invalid =
                !(update.changes.currency === undefined
                  ? current.capabilities.equal
                  : current.capabilities.recalculate) ||
                roundMoney(original_amount) !== original_amount ||
                !isSupportedCurrency(currency) ||
                !Number.isFinite(product) ||
                roundMoney(product) > MAX_EXPENSE_AMOUNT ||
                !members.some((m) => m.id === payer_id) ||
                splits.some((s) => shares[s.user_id] !== s.share_amount) ||
                members.filter((m) => selected.has(m.id)).length !== splits.length;
              set = {
                ...set,
                ...ledgerStamp(),
                originalAmount: original_amount,
                amount: roundMoney(product),
                payer: new mongo.ObjectId(payer_id),
                currency,
                exchangeRate: rate,
                splits: members
                  .filter((m) => selected.has(m.id))
                  .map((m) => ({ user: new mongo.ObjectId(m.id), shareAmount: shares[m.id] })),
              };
            }
          }
          if (invalid) terminal = reject('VALIDATION_ERROR');
          else {
            if (operation === 'expense.update')
              await db.collection('expenses').updateOne(filter, { $set: set }, { session });
            else {
              const raw = await db.collection<RawExpense>('expenses').findOne(filter, { session });
              await db.collection('expenses').deleteOne(filter, { session });
              await db
                .collection('comments')
                .deleteMany({ expense: filter._id, trip: filter.trip }, { session });
              keys = await retireUnreferencedBlobs(
                db,
                session,
                tripId,
                (raw?.attachments ?? []).map((a) => a.key)
              );
            }
            await db.collection('activitylogs').insertOne(
              {
                trip: filter.trip,
                actor: new mongo.ObjectId(actorId),
                actorName: current.options.members.find((m) => m.id === actorId)?.displayName ?? '',
                type: operation === 'expense.update' ? 'expense_updated' : 'expense_deleted',
                meta: {
                  expense_id: expenseId,
                  description:
                    operation === 'expense.update' && 'changes' in input
                      ? ((input as ExpenseUpdateInput).changes.description ??
                        current.expense.description)
                      : current.expense.description,
                },
                createdAt: new Date(),
              },
              { session }
            );
            const next =
              operation === 'expense.update'
                ? await contextInSnapshot(db, session, tripId, expenseId, secret)
                : null;
            terminal = {
              status: 'committed',
              operation,
              resourceId: expenseId,
              result: {
                tripId,
                expenseId,
                ...(next ? { revision: next.revision } : { deleted: true as const }),
              },
            };
          }
        }
        // The first response is the stored receipt, so a replay returns exactly the same terminal.
        const stored = terminalWithLedger(terminal);
        await receipts.insertOne(
          {
            _id: key,
            fingerprint,
            ...receiptStamp(),
            terminal: stored,
            createdAt: new Date(),
          },
          { session }
        );
        return { terminal: stored, keys };
      });
      if (accepted.terminal.status === 'rejected') throw new TripEntryError(accepted.terminal.code);
      await Promise.resolve()
        .then(() => cleanup(db, accepted.keys))
        .catch(() => undefined);
      return accepted.terminal.result as ExpenseMutationResult;
    } catch (error) {
      if ((error as { code?: number })?.code === 11000 && attempt < 9) continue;
      throw error;
    }
  }
  throw new TripEntryError('BUSY');
}

/** Web advanced editing retains its existing whitelist and upload validation. */
export const updateExpenseForActor = async (
  actorId: string,
  tripId: string,
  expenseId: string,
  input: UpdateExpenseInput
): Promise<ActionResult<{ message: string; revision?: string }>> => {
  try {
    const validation = updateExpenseSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      };
    }

    if (
      !validation.data.base_currency ||
      !validation.data.client_request_id ||
      !validation.data.expected_revision
    )
      return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
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

    // Attachment verification is external I/O. A replay must not depend on the
    // continued existence of the expense or an already retired receipt blob.
    if (attachments !== undefined) {
      const previous = await withTripReadInDatabase(
        mongoose.connection.db!,
        tripId,
        actorId,
        async (session) => {
          const receipt = await mongoose.connection.db!.collection(MUTATION_REQUESTS).findOne(
            {
              _id: `${actorId.toLowerCase()}:${validation.data.client_request_id!.toLowerCase()}` as never,
            },
            { session }
          );
          if (!receipt) return undefined;
          checkReceiptVersion({ contractVersion: receipt.contractVersion, ledger: receipt.ledger });
          const fingerprint = createHash('sha256')
            .update(
              JSON.stringify(
                canonical({
                  contractVersion: 2,
                  baseCurrency: validation.data.base_currency,
                  operation: 'web.expense.update',
                  tripId,
                  expenseId,
                  input: validation.data,
                })
              )
            )
            .digest('hex');
          if (receipt.fingerprint !== fingerprint) throw new TripWriteError('CONFLICT');
          return receipt.terminal as Terminal;
        }
      );
      if (previous?.status === 'rejected')
        return { success: false, error: previous.code, code: previous.code };
      if (previous?.status === 'committed')
        return { success: true, data: { message: '支出已更新', ...previous.result } };
    }
    // Only attachments need an outside-transaction baseline; existence and
    // terminal outcomes are checked under the write fence below.
    const snapshot =
      attachments === undefined
        ? null
        : await Expense.findOne({ _id: expenseId, trip: tripId })
            .select(
              'payer amount originalAmount currency exchangeRate description category date splits attachments tags itineraryDays'
            )
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

    const initialKeys = new Set((snapshot?.attachments ?? []).map((a) => a.key));
    const verified =
      attachments === undefined || !snapshot
        ? []
        : await resolveAttachments(
            tripId,
            actorId,
            attachments.filter((a) => !initialKeys.has(a.key))
          );
    if (!verified) return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
    const { removed, terminal } = await withTripWrite(
      tripId,
      actorId,
      async (transactionSession) => {
        // 讀取目前值（同時作為 existence check）
        const current = await Expense.findOne({ _id: expenseId, trip: tripId })
          .session(transactionSession)
          .select(
            'payer amount originalAmount currency exchangeRate description category date splits attachments tags itineraryDays'
          )
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

        const unit = validation.data.base_currency!;
        const body = validation.data;
        const key = `${actorId.toLowerCase()}:${body.client_request_id!.toLowerCase()}`;
        const fingerprint = createHash('sha256')
          .update(
            JSON.stringify(
              canonical({
                contractVersion: 2,
                baseCurrency: unit,
                operation: 'web.expense.update',
                tripId,
                expenseId,
                input: body,
              })
            )
          )
          .digest('hex');
        const receipts = mongoose.connection.db!.collection(MUTATION_REQUESTS);
        const existing = await receipts.findOne(
          { _id: key as never },
          { session: transactionSession }
        );
        if (existing) {
          checkReceiptVersion({
            contractVersion: existing.contractVersion,
            ledger: existing.ledger,
          });
          if (existing.fingerprint !== fingerprint) throw new TripWriteError('CONFLICT');
          return { removed: [] as string[], terminal: existing.terminal as Terminal };
        }
        const parent = await Trip.findById(tripId)
          .session(transactionSession)
          .select('members baseCurrency')
          .lean();
        const revision = current
          ? webExpenseRevision(getEnv().JWT_SECRET, tripId, current, parent!.members)
          : undefined;
        if (
          !current ||
          unit !== currentLedger().baseCurrency ||
          body.expected_revision !== revision
        ) {
          const terminal = terminalWithLedger({
            status: 'rejected' as const,
            operation: 'expense.update' as const,
            tripId,
            code: !current
              ? ('RESOURCE_GONE' as const)
              : unit !== currentLedger().baseCurrency
                ? ('LEDGER_CURRENCY_MISMATCH' as const)
                : ('RESOURCE_CHANGED' as const),
          });
          await receipts.insertOne(
            {
              _id: key as never,
              fingerprint,
              terminal,
              ...receiptStamp(),
              createdAt: new Date(),
            },
            { session: transactionSession }
          );
          return { removed: [] as string[], terminal };
        }
        const raw = current as typeof current & { currency: string; amount: number };
        const oa = original_amount ?? current.originalAmount,
          er = exchange_rate ?? current.exchangeRate,
          code = currency ?? raw.currency;
        if (
          (original_amount !== undefined ||
            currency !== undefined ||
            exchange_rate !== undefined ||
            splits !== undefined ||
            payer_id !== undefined) &&
          ((code === unit && er !== 1) ||
            !isSupportedCurrency(code) ||
            !Number.isSafeInteger(Math.round(oa * 100)) ||
            roundMoney(oa) !== oa ||
            !Number.isFinite(oa * er) ||
            roundMoney(oa * er) > MAX_EXPENSE_AMOUNT ||
            splits?.some((s) => !isCentShare(s.share_amount)) ||
            ((original_amount !== undefined ||
              currency !== undefined ||
              exchange_rate !== undefined) &&
              (!splits ||
                original_amount === undefined ||
                currency === undefined ||
                exchange_rate === undefined)))
        )
          throw new TripWriteError('VALIDATION_ERROR');

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
          const memberIds = new Set((trip?.members ?? []).map((member) => member.user.toString()));
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

        // Recalculate ledger amount if needed
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

        await retireUnreferencedBlobs(mongoose.connection.db!, transactionSession, tripId, removed);
        const terminal = terminalWithLedger({
          status: 'committed',
          operation: 'expense.update',
          resourceId: expenseId,
          result: {
            tripId,
            expenseId,
            revision: webExpenseRevision(
              getEnv().JWT_SECRET,
              tripId,
              (await Expense.findOne({ _id: expenseId, trip: tripId })
                .session(transactionSession)
                .select(
                  'payer amount originalAmount currency exchangeRate description category date splits attachments tags itineraryDays'
                )
                .lean())!,
              (await Trip.findById(tripId).session(transactionSession).select('members').lean())!
                .members
            ),
          },
        } as Terminal);
        await mongoose.connection.db!.collection(MUTATION_REQUESTS).insertOne(
          {
            _id: key as never,
            fingerprint,
            terminal,
            ...receiptStamp(),
            createdAt: new Date(),
          },
          { session: transactionSession }
        );
        await mongoose.connection.db!.collection('activitylogs').insertOne(
          {
            trip: new mongo.ObjectId(tripId),
            actor: new mongo.ObjectId(actorId),
            actorName:
              (
                await mongoose.connection
                  .db!.collection('users')
                  .findOne(
                    { _id: new mongo.ObjectId(actorId) },
                    { session: transactionSession, projection: { displayName: 1 } }
                  )
              )?.displayName ?? '',
            type: 'expense_updated',
            meta: { expense_id: expenseId, description: description ?? current.description },
            createdAt: new Date(),
          },
          { session: transactionSession }
        );
        return { removed, terminal };
      }
    );
    if (terminal.status === 'rejected')
      return {
        success: false,
        error: terminal.code,
        code: terminal.code,
      };
    await cleanupRetiredBlobs(mongoose.connection.db!, removed).catch(() => undefined);

    return {
      success: true,
      data: { message: '支出已更新', ...(terminal.status === 'committed' ? terminal.result : {}) },
    };
  } catch (error) {
    if (error instanceof LedgerError)
      return { success: false, error: error.code, code: error.code };
    if (error instanceof RetiredBlobError)
      return { success: false, error: error.code, code: error.code };
    if (error instanceof TripWriteError)
      return { success: false, error: error.code, code: error.code };
    logger.error('Update expense error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
};

export const deleteExpenseForActor = async (
  actorId: string,
  tripId: string,
  expenseId: string,
  confirmation?: { client_request_id: string; expected_revision: string; base_currency: string }
): Promise<ActionResult<{ message: string }>> => {
  try {
    const doc = await withTripWrite(tripId, actorId, async (transactionSession) => {
      // 先讀附件 key（刪 R2 物件用）+ 描述（動態牆顯示用）
      const doc = await Expense.findOne({ _id: expenseId, trip: tripId })
        .session(transactionSession)
        .select(
          'payer amount originalAmount currency exchangeRate description category date splits attachments tags itineraryDays'
        )
        .lean<{ attachments?: { key: string }[]; description?: string }>();

      if (
        !confirmation ||
        !z.string().uuid().safeParse(confirmation.client_request_id).success ||
        !/^[a-f0-9]{64}$/.test(confirmation.expected_revision)
      )
        throw new TripWriteError('VALIDATION_ERROR');
      const key = `${actorId.toLowerCase()}:${confirmation.client_request_id.toLowerCase()}`;
      const receipts = mongoose.connection.db!.collection(MUTATION_REQUESTS);
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify(
            canonical({
              contractVersion: 2,
              operation: 'web.expense.delete',
              tripId,
              expenseId,
              input: confirmation,
            })
          )
        )
        .digest('hex');
      const existing = await receipts.findOne(
        { _id: key as never },
        { session: transactionSession }
      );
      if (existing) {
        checkReceiptVersion({
          contractVersion: existing.contractVersion,
          ledger: existing.ledger,
        });
        if (existing.fingerprint !== fingerprint) throw new TripWriteError('CONFLICT');
        return { ...doc, terminal: existing.terminal as Terminal };
      }
      const parent = await Trip.findById(tripId)
        .session(transactionSession)
        .select('members baseCurrency')
        .lean();
      const code =
        confirmation.base_currency !== currentLedger().baseCurrency
          ? 'LEDGER_CURRENCY_MISMATCH'
          : !doc
            ? 'RESOURCE_GONE'
            : confirmation.expected_revision !==
                webExpenseRevision(getEnv().JWT_SECRET, tripId, doc, parent!.members)
              ? 'RESOURCE_CHANGED'
              : null;
      const terminal = terminalWithLedger(
        code
          ? { status: 'rejected', operation: 'expense.delete', tripId, code }
          : {
              status: 'committed',
              operation: 'expense.delete',
              resourceId: expenseId,
              result: { tripId, expenseId, deleted: true },
            }
      );
      await receipts.insertOne(
        { _id: key as never, fingerprint, terminal, ...receiptStamp(), createdAt: new Date() },
        { session: transactionSession }
      );
      if (code) return { ...doc, terminal: terminal as Terminal };
      await Expense.deleteOne({ _id: expenseId, trip: tripId }, { session: transactionSession });

      await Comment.deleteMany(
        { expense: expenseId, trip: tripId },
        { session: transactionSession }
      );
      await retireUnreferencedBlobs(
        mongoose.connection.db!,
        transactionSession,
        tripId,
        (doc?.attachments ?? []).map((a) => a.key)
      );
      await mongoose.connection.db!.collection('activitylogs').insertOne(
        {
          trip: new mongo.ObjectId(tripId),
          actor: new mongo.ObjectId(actorId),
          actorName:
            (
              await mongoose.connection
                .db!.collection('users')
                .findOne(
                  { _id: new mongo.ObjectId(actorId) },
                  { session: transactionSession, projection: { displayName: 1 } }
                )
            )?.displayName ?? '',
          type: 'expense_deleted',
          meta: {
            description: doc?.description ?? '',
            baseCurrency: currentLedger().baseCurrency,
          },
          createdAt: new Date(),
        },
        { session: transactionSession }
      );
      return doc;
    });

    if (doc && 'terminal' in doc && (doc.terminal as Terminal).status === 'rejected')
      return {
        success: false,
        error: (doc.terminal as Extract<Terminal, { status: 'rejected' }>).code,
        code: 'CONFLICT',
      };
    const keys = (doc?.attachments ?? []).map((a) => a.key);
    await cleanupRetiredBlobs(mongoose.connection.db!, keys).catch(() => undefined);

    return { success: true, data: { message: '支出已刪除' } };
  } catch (error) {
    if (error instanceof TripWriteError)
      return { success: false, error: error.code, code: error.code };
    logger.error('Delete expense error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
};
