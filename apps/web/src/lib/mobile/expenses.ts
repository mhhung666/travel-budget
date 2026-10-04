import { Types } from 'mongoose';
import { Expense } from '@/models';
import { toExpenseDto, type ExpenseDtoInput } from '@/lib/dto';
import type { Expense as ExpenseDto } from '@/types';
import { ApiError } from './http';
import { requireTripMember } from './access';
import {
  expenseCategories,
  expenseDetailSchema,
  expensesSchema,
  idSchema,
  type MobileExpense,
  type MobileExpenseDetail,
} from './contract';

const PAGE_SIZE = 20;
// Explicit projection: attachments, tags, itinerary links and outbox state never leave the database.
const FIELDS =
  'payer amount originalAmount currency exchangeRate description category date createdAt splits';
type LeanExpense = ExpenseDtoInput & { date: Date; createdAt: Date };
type Cursor = { date: Date; createdAt: Date; id: string };

// `<date ms>.<createdAt ms>.<id>`: exact stored values, so ties never skip or repeat a row.
const CURSOR = /^(-?\d{1,15})\.(\d{1,15})\.([a-f\d]{24})$/i;
const categories = new Set<string>(expenseCategories);

export function encodeExpenseCursor(expense: LeanExpense & { _id: { toString(): string } }) {
  return `${expense.date.getTime()}.${expense.createdAt.getTime()}.${expense._id.toString()}`;
}
function decodeExpenseCursor(value: string): Cursor {
  const match = CURSOR.exec(value);
  if (!match) throw new ApiError(400, 'VALIDATION_ERROR');
  // Up to 15 digits is always inside the valid Date range.
  return { date: new Date(Number(match[1])), createdAt: new Date(Number(match[2])), id: match[3] };
}
function cursorParam(url: URL): Cursor | null {
  const values = url.searchParams.getAll('cursor');
  if (values.length === 0) return null;
  if (values.length > 1) throw new ApiError(400, 'VALIDATION_ERROR');
  return decodeExpenseCursor(values[0]);
}
// Rows strictly after the cursor in `date desc, createdAt desc, _id desc` order.
function afterCursor({ date, createdAt, id }: Cursor) {
  return {
    $or: [
      { date: { $lt: date } },
      { date, createdAt: { $lt: createdAt } },
      { date, createdAt, _id: { $lt: new Types.ObjectId(id) } },
    ],
  };
}

const finite = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

// `.lean()` skips schema defaults, so old documents may lack the original-currency fields.
function toMobileExpense(expense: ExpenseDto): MobileExpense {
  return {
    id: expense.id,
    date: expense.date,
    description: expense.description,
    category: categories.has(expense.category)
      ? (expense.category as MobileExpense['category'])
      : 'other',
    payerId: expense.payer_id || null,
    payerName: expense.payer_id ? expense.payer_name : '',
    amount: expense.amount,
    originalAmount: finite(expense.original_amount, expense.amount),
    currency: expense.currency || 'TWD',
  };
}
// Also maps the accepted result of an expense creation, which is stored in the Web DTO shape.
export function toMobileExpenseDetail(expense: ExpenseDto): MobileExpenseDetail {
  return {
    ...toMobileExpense(expense),
    exchangeRate: finite(expense.exchange_rate, 1),
    splits: expense.splits.map((split) => ({
      userId: split.user_id || null,
      displayName: split.user_id ? split.display_name : '',
      shareAmount: split.share_amount,
    })),
  };
}
// Same populate and DTO rules as the Web `getExpenses`; only display names are selected.
export async function mobileExpenses(userId: string, id: string, url: URL) {
  const cursor = cursorParam(url);
  const tripId = await requireTripMember(userId, id);
  const expenses = await Expense.find({ trip: tripId, ...(cursor ? afterCursor(cursor) : {}) })
    .sort({ date: -1, createdAt: -1, _id: -1 })
    .limit(PAGE_SIZE + 1)
    .select(FIELDS)
    .populate('payer', 'displayName')
    .populate('splits.user', 'displayName')
    .lean<(LeanExpense & { _id: Types.ObjectId })[]>();
  const page = expenses.slice(0, PAGE_SIZE);
  return expensesSchema.parse({
    items: page.map((expense) =>
      toMobileExpense(toExpenseDto(expense, tripId, { attachments: false }))
    ),
    nextCursor: expenses.length > PAGE_SIZE ? encodeExpenseCursor(page[page.length - 1]) : null,
  });
}
export async function mobileExpense(userId: string, id: string, expenseId: string) {
  const tripId = await requireTripMember(userId, id);
  if (!idSchema.safeParse(expenseId).success) throw new ApiError(404, 'NOT_FOUND');
  // The trip filter rejects expenses that belong to another trip.
  const expense = await Expense.findOne({ _id: expenseId, trip: tripId })
    .select(FIELDS)
    .populate('payer', 'displayName')
    .populate('splits.user', 'displayName')
    .lean<LeanExpense | null>();
  if (!expense) throw new ApiError(404, 'NOT_FOUND');
  return expenseDetailSchema.parse(
    toMobileExpenseDetail(toExpenseDto(expense, tripId, { attachments: false }))
  );
}
