import { createHash } from 'node:crypto';
import { mongo } from 'mongoose';
import {
  expenseCategories,
  expenseSearchInputSchema,
  expenseSearchV2Schema,
  type ExpenseSearchInput,
} from '@travel-budget/contracts';
import { toExpenseDto, type ExpenseDtoInput } from './dto';
import { EMPTY_EXPENSE_FILTERS, filterExpenses } from './expenseFilters';
import { computeTripStats } from './tripStats';
import { currentLedger } from './ledger';
import { moneyTotal } from './money';
import { withTripReadInDatabase } from './tripWriteTransaction';
import { toMobileExpenseDetail } from './mobile/expenses';

export class ExpenseSearchChanged extends Error {}
export function parseExpenseSearch(url: URL): ExpenseSearchInput {
  const values: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key in values) throw new Error('Duplicate query parameter');
    values[key] = value;
  }
  return expenseSearchInputSchema.parse(values);
}
type SearchRow = ExpenseDtoInput;
/** Shared Web filters/calculator, applied before pagination to one authorized snapshot. */
export function searchExpenseRows(
  rows: SearchRow[],
  actorId: string,
  tripId: string,
  input: ExpenseSearchInput
) {
  const { cursor, ...filters } = expenseSearchInputSchema.parse(input);
  const identities = new Map<
    string,
    { userId: string | null; displayName: string; isVirtual?: boolean }
  >();
  const identity = (ref: SearchRow['payer']) => {
    const id = ref?._id.toString() ?? '';
    identities.set(id, {
      userId: id || null,
      displayName: ref?.displayName ?? '',
      ...(typeof ref?.isVirtual === 'boolean' ? { isVirtual: ref.isVirtual } : {}),
    });
    return id;
  };
  const payerIds = new Set<string>();
  const dtos = rows.map((row) => {
    payerIds.add(identity(row.payer));
    row.splits?.forEach((s) => identity(s.user));
    const dto = toExpenseDto(row, tripId, { attachments: false });
    // Match the existing native DTO's unknown-category bucket; hidden tags never affect search.
    return {
      ...dto,
      category: expenseCategories.includes(dto.category as (typeof expenseCategories)[number])
        ? dto.category
        : 'other',
      tags: [],
      payer_name: row.payer?.displayName ?? '',
    };
  });
  const matches = filterExpenses(dtos, {
    ...EMPTY_EXPENSE_FILTERS,
    keyword: filters.keyword,
    category: filters.category ?? 'all',
    payerId: filters.payerId === 'missing' ? '' : (filters.payerId?.toLowerCase() ?? 'all'),
    dateFrom: filters.dateFrom ?? '',
    dateTo: filters.dateTo ?? '',
  });
  const stats = computeTripStats(
    matches.map((e) => ({
      id: e.id,
      category: e.category,
      date: e.date,
      description: e.description,
      amount: e.amount,
      payerId: e.payer_id,
      payerName: e.payer_name,
      splits: e.splits.map((s) => ({ userId: s.user_id, shareAmount: s.share_amount })),
    })),
    [...identities].map(([userId, value]) => ({ userId, name: value.displayName })),
    {}
  );
  // Missing references still belong to the matching accounting totals (no invented identity).
  const missingPaid = matches.filter((e) => !e.payer_id).map((e) => e.amount);
  const ledger = currentLedger();
  const revision = createHash('sha256')
    .update(JSON.stringify([actorId, tripId, ledger, filters, dtos, [...identities]]))
    .digest('hex');
  let offset = 0;
  if (cursor) {
    const [previous, index] = cursor.split('.');
    offset = Number(index);
    if (previous !== revision || offset % 20 !== 0 || offset >= matches.length)
      throw new ExpenseSearchChanged();
  }
  const page = matches.slice(offset, offset + 20);
  return expenseSearchV2Schema.parse({
    ledger,
    filters,
    revision,
    items: page.map((e) => ({
      ...toMobileExpenseDetail(e),
      ledger,
      ...(identities.get(e.payer_id)?.isVirtual === undefined
        ? {}
        : { payerIsVirtual: identities.get(e.payer_id)!.isVirtual }),
    })),
    nextCursor: offset + 20 < matches.length ? `${revision}.${offset + 20}` : null,
    payers: [...payerIds].map((id) => identities.get(id)!),
    summary: {
      count: stats.totalExpenses,
      total: stats.totalAmount,
      mySpent: stats.memberSpends.find((m) => m.userId === actorId)?.share ?? 0,
      categories: stats.categoryStats.map(({ category, count, total }) => ({
        category,
        count,
        total,
      })),
      members: stats.memberSpends
        .map((m) => ({
          ...identities.get(m.userId)!,
          paid: m.userId ? m.paid : moneyTotal(missingPaid),
          share: m.share,
        }))
        .filter((m) => m.paid !== 0 || m.share !== 0),
    },
  });
}
type StoredExpense = Omit<ExpenseDtoInput, 'payer' | 'splits'> & {
  _id: mongo.ObjectId;
  trip: mongo.ObjectId;
  payer: mongo.ObjectId | null;
  splits: { user: mongo.ObjectId | null; shareAmount: number }[];
};
type ReadUser = { _id: mongo.ObjectId; displayName: string; isVirtual?: boolean };
export async function readExpenseSearch(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  input: ExpenseSearchInput
) {
  return withTripReadInDatabase(db, tripId, actorId, async (session) => {
    const rows = await db
      .collection<StoredExpense>('expenses')
      .find(
        { trip: new mongo.ObjectId(tripId) },
        {
          session,
          projection: {
            baseCurrency: 1,
            payer: 1,
            amount: 1,
            originalAmount: 1,
            currency: 1,
            exchangeRate: 1,
            description: 1,
            category: 1,
            date: 1,
            createdAt: 1,
            splits: 1,
          },
        }
      )
      .sort({ date: -1, createdAt: -1, _id: -1 })
      .toArray();
    const refs = new Map<string, mongo.ObjectId>();
    for (const row of rows)
      for (const id of [row.payer, ...(row.splits ?? []).map((s) => s.user)])
        if (id) refs.set(id.toString(), id);
    const users = await db
      .collection<ReadUser>('users')
      .find(
        { _id: { $in: [...refs.values()] } },
        { session, projection: { displayName: 1, isVirtual: 1 } }
      )
      .toArray();
    const byId = new Map(users.map((u) => [u._id.toString(), { ...u, username: '' }]));
    const user = (id: mongo.ObjectId | null) => (id ? (byId.get(id.toString()) ?? null) : null);
    return searchExpenseRows(
      rows.map((row) => ({
        ...row,
        payer: user(row.payer),
        splits: (row.splits ?? []).map((s) => ({ ...s, user: user(s.user) })),
      })),
      actorId,
      tripId,
      input
    );
  });
}
