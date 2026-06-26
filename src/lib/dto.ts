import type { Expense as ExpenseDto, Trip as TripDto, PaymentRecord } from '@/types';
import type { TripStatsExpense, TripStatsMember } from '@/lib/tripStats';

/**
 * Shared model → public DTO mappers.
 *
 * Both the authenticated Server Actions (src/actions/*) and the unauthenticated
 * public share routes (src/app/api/public/*) need to turn lean Mongoose docs
 * into the same snake_case DTO shape the frontend consumes. Keeping the mapping
 * here (instead of duplicating it per route) prevents the two surfaces from
 * drifting. Input types are structural so any `.lean()` projection that carries
 * the needed fields satisfies them.
 */

type PopulatedRef = { _id: { toString(): string }; username: string; displayName: string } | null;

/** Minimal lean Expense shape `toExpenseDto` needs (payer + splits populated). */
export type ExpenseDtoInput = {
  _id: { toString(): string };
  amount: number;
  originalAmount: number;
  currency: string;
  exchangeRate: number;
  description: string;
  category: string | null;
  date: Date | string;
  createdAt: Date;
  payer: PopulatedRef;
  splits: { user: PopulatedRef; shareAmount: number }[];
};

function toDateStr(d: Date | string): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : d;
}

export function toExpenseDto(e: ExpenseDtoInput, tripId: string): ExpenseDto {
  return {
    id: e._id.toString(),
    trip_id: tripId,
    amount: e.amount,
    original_amount: e.originalAmount,
    currency: e.currency,
    exchange_rate: e.exchangeRate,
    description: e.description,
    category: e.category || 'other',
    date: toDateStr(e.date),
    created_at: e.createdAt.toISOString(),
    payer_id: e.payer?._id.toString() || '',
    payer_name: e.payer?.displayName || 'Unknown',
    splits: (e.splits || []).map((s) => ({
      user_id: s.user?._id.toString() || '',
      share_amount: s.shareAmount,
      username: s.user?.username || 'Unknown',
      display_name: s.user?.displayName || 'Unknown',
    })),
  };
}

/** Minimal lean Trip shape `toTripDto` needs. `members` is only read when `viewerId` is given. */
export type TripDtoInput = {
  _id: { toString(): string };
  name: string;
  description?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  departureLocation?: unknown;
  destinationLocation?: unknown;
  hashCode: string;
  createdAt: Date;
  members?: { user: { toString(): string }; archivedAt?: Date | string | null }[];
  budget?: { total?: number | null; categories?: { category: string; amount: number }[] } | null;
};

/**
 * @param viewerId 當前使用者 id；封存是「個別」的，故 archived_at 取該使用者
 *   自己那筆 member 的 archivedAt。傳 undefined（如公開分享情境）則一律視為未封存。
 */
export function toTripDto(t: TripDtoInput, viewerId?: string): TripDto {
  const self = viewerId ? t.members?.find((m) => m.user.toString() === viewerId) : undefined;
  return {
    id: t._id.toString(),
    name: t.name,
    description: t.description ?? null,
    start_date: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
    end_date: t.endDate ? t.endDate.toISOString().slice(0, 10) : null,
    departure_location: (t.departureLocation ?? null) as TripDto['departure_location'],
    destination_location: (t.destinationLocation ?? null) as TripDto['destination_location'],
    hash_code: t.hashCode,
    created_at: t.createdAt.toISOString(),
    archived_at: self?.archivedAt ? new Date(self.archivedAt).toISOString() : null,
    budget: t.budget
      ? {
          total: t.budget.total ?? null,
          categories: (t.budget.categories ?? []).map((c) => ({
            category: c.category,
            amount: c.amount,
          })),
        }
      : null,
  };
}

/** Minimal lean Expense shape the group-stats mapper needs (payer populated). */
export type TripStatExpenseInput = {
  _id: { toString(): string };
  category: string | null;
  date: Date | string;
  description: string;
  amount: number;
  payer: PopulatedRef;
  splits: { user: { toString(): string }; shareAmount: number }[];
};

/** Minimal lean Trip shape the group-stats mapper needs (members populated + dates). */
export type TripStatsTripInput = {
  members: { user: { _id: { toString(): string }; displayName: string } | null }[];
  startDate?: Date | null;
  endDate?: Date | null;
} | null;

/**
 * Lean Trip + Expense docs → `computeTripStats` inputs. Shared by the
 * authenticated `getTripStats` action and the public stats route so the two
 * surfaces map identically (same drift-prevention rationale as the DTO mappers).
 */
export function toTripStatsInputs(
  trip: TripStatsTripInput,
  expenses: TripStatExpenseInput[]
): {
  members: TripStatsMember[];
  expenses: TripStatsExpense[];
  range: { startDate: string | null; endDate: string | null };
} {
  const members: TripStatsMember[] = (trip?.members || [])
    .map((m) => m.user)
    .filter((u): u is NonNullable<typeof u> => u !== null)
    .map((u) => ({ userId: u._id.toString(), name: u.displayName }));

  const mapped: TripStatsExpense[] = expenses.map((e) => ({
    id: e._id.toString(),
    category: e.category,
    date: toDateStr(e.date),
    description: e.description || '',
    amount: e.amount || 0,
    payerId: e.payer?._id.toString() || '',
    payerName: e.payer?.displayName || 'Unknown',
    splits: (e.splits || []).map((s) => ({
      userId: s.user.toString(),
      shareAmount: s.shareAmount || 0,
    })),
  }));

  return {
    members,
    expenses: mapped,
    range: {
      startDate: trip?.startDate ? toDateStr(trip.startDate) : null,
      endDate: trip?.endDate ? toDateStr(trip.endDate) : null,
    },
  };
}

/** Minimal lean Payment shape `toPaymentRecord` needs (from + to populated). */
export type PaymentDtoInput = {
  _id: { toString(): string };
  from: PopulatedRef;
  to: PopulatedRef;
  amount: number;
  note?: string | null;
  createdAt: Date;
};

/**
 * Lean Payment doc → settlement-display record. Note this returns the **camelCase**
 * shape the settlement subsystem uses (like `Balance`/`Transaction`), not the
 * snake_case DTO shape of `toExpenseDto`/`toTripDto`. Shared by the settlement
 * action and the public settlement route so the two surfaces don't drift.
 */
export function toPaymentRecord(p: PaymentDtoInput): PaymentRecord {
  return {
    id: p._id.toString(),
    fromId: p.from?._id.toString() || '',
    fromName: p.from?.displayName || 'Unknown',
    toId: p.to?._id.toString() || '',
    toName: p.to?.displayName || 'Unknown',
    amount: p.amount,
    note: p.note ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}
