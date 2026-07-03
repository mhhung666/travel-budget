import type { ChecklistKind } from '@/types';
import type {
  Expense as ExpenseDto,
  Trip as TripDto,
  PaymentRecord,
  Checklist,
  NotificationItem,
  NotificationType,
  NotificationMeta,
  ActivityLogItem,
  ActivityLogType,
  ActivityLogMeta,
  CommentDto,
  TripNote,
} from '@/types';
import type { TripStatsDay, TripStatsExpense, TripStatsMember } from '@/lib/tripStats';

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
  attachments?: { key: string; contentType: string; size: number }[];
  itineraryDays?: { toString(): string }[] | null;
  tags?: string[] | null;
};

function toDateStr(d: Date | string): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : d;
}

export function toExpenseDto(
  e: ExpenseDtoInput,
  tripId: string,
  opts?: { attachments?: boolean }
): ExpenseDto {
  // 收據預設帶出（已登入情境）；公開分享路由傳 { attachments: false }，避免把收據
  // 外洩到未登入的分享頁（隱私決策：收據常含卡號/地址）。
  const includeAttachments = opts?.attachments ?? true;
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
    attachments: includeAttachments
      ? (e.attachments || []).map((a) => ({
          key: a.key,
          content_type: a.contentType,
          size: a.size,
        }))
      : [],
    itinerary_day_ids: (e.itineraryDays ?? []).map((d) => d.toString()),
    tags: e.tags ?? [],
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
  itineraryDays?: { toString(): string }[] | null;
  tags?: string[] | null;
};

/** Minimal lean Trip shape the group-stats mapper needs (members populated + dates). */
export type TripStatsTripInput = {
  members: { user: { _id: { toString(): string }; displayName: string } | null }[];
  startDate?: Date | null;
  endDate?: Date | null;
} | null;

/** Minimal lean ItineraryDay shape the per-day aggregation needs. */
export type TripStatsDayInput = {
  _id: { toString(): string };
  dayNumber: number;
  title: string;
};

/**
 * Lean Trip + Expense docs → `computeTripStats` inputs. Shared by the
 * authenticated `getTripStats` action and the public stats route so the two
 * surfaces map identically (same drift-prevention rationale as the DTO mappers).
 */
export function toTripStatsInputs(
  trip: TripStatsTripInput,
  expenses: TripStatExpenseInput[],
  days: TripStatsDayInput[] = []
): {
  members: TripStatsMember[];
  expenses: TripStatsExpense[];
  range: { startDate: string | null; endDate: string | null };
  days: TripStatsDay[];
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
    itineraryDayIds: (e.itineraryDays ?? []).map((d) => d.toString()),
    tags: e.tags ?? [],
  }));

  const mappedDays: TripStatsDay[] = days.map((d) => ({
    id: d._id.toString(),
    dayNumber: d.dayNumber,
    title: d.title,
  }));

  return {
    members,
    expenses: mapped,
    range: {
      startDate: trip?.startDate ? toDateStr(trip.startDate) : null,
      endDate: trip?.endDate ? toDateStr(trip.endDate) : null,
    },
    days: mappedDays,
  };
}

/** Minimal lean Checklist shape `toChecklistDto` needs (items.assignee populated). */
export type ChecklistDtoInput = {
  _id: { toString(): string };
  trip: { toString(): string };
  kind?: ChecklistKind | null;
  title: string;
  items: {
    _id: { toString(): string };
    text: string;
    // doneBy 只帶 id（不 populate），是勾選者的 ObjectId 陣列。
    doneBy?: { toString(): string }[] | null;
    assignee: PopulatedRef;
  }[];
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Lean Checklist doc → snake_case DTO (like `toExpenseDto`/`toDayDto`, not the
 * camelCase settlement shape). Each item's `assignee` must be populated; an
 * unassigned item or a dangling ref (assignee user deleted) both map to null.
 * `done` is the shared-semantics completion flag (= doneBy 非空); `done_by`
 * carries the raw勾選者 ids so packing lists can render per-member state.
 * Shared by the authenticated checklist actions and the public checklist route.
 */
export function toChecklistDto(c: ChecklistDtoInput): Checklist {
  return {
    id: c._id.toString(),
    trip_id: c.trip.toString(),
    kind: c.kind ?? 'todo',
    title: c.title,
    items: (c.items || []).map((i) => {
      const doneBy = (i.doneBy || []).map((u) => u.toString());
      return {
        id: i._id.toString(),
        text: i.text,
        done: doneBy.length > 0,
        done_by: doneBy,
        assignee_id: i.assignee?._id.toString() ?? null,
        assignee_name: i.assignee?.displayName ?? null,
      };
    }),
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
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

/** Minimal lean Notification shape `toNotificationDto` needs (display fields denormalized). */
export type NotificationDtoInput = {
  _id: { toString(): string };
  type: NotificationType;
  // 好友邀請等非旅程通知沒有 trip；DTO 以空字串表示。
  trip?: { toString(): string } | null;
  tripName?: string | null;
  actorName?: string | null;
  meta?: NotificationMeta | null;
  read: boolean;
  createdAt: Date;
};

/**
 * Lean Notification doc → frontend DTO. Display fields (trip/actor name) are
 * already denormalized on the doc, so this needs no populate. The localized
 * message is rendered client-side from `type` + `meta` (the recipient's locale,
 * not the writer's), so we pass the structured data through untouched.
 */
export function toNotificationDto(n: NotificationDtoInput): NotificationItem {
  return {
    id: n._id.toString(),
    type: n.type,
    trip_id: n.trip ? n.trip.toString() : '',
    trip_name: n.tripName ?? '',
    actor_name: n.actorName ?? '',
    meta: n.meta ?? {},
    read: n.read,
    created_at: n.createdAt.toISOString(),
  };
}

/** Minimal lean ActivityLog shape `toActivityLogDto` needs (actorName denormalized). */
export type ActivityLogDtoInput = {
  _id: { toString(): string };
  type: ActivityLogType;
  actorName?: string | null;
  meta?: ActivityLogMeta | null;
  createdAt: Date;
};

/**
 * Lean ActivityLog doc → frontend DTO. `actor_name` is already denormalized on
 * the doc, so this needs no populate. The localized message is rendered
 * client-side from `type` + `meta` (the viewer's locale), so we pass the
 * structured data through untouched. Trip-scoped (no per-recipient `read`
 * state), unlike `toNotificationDto`.
 */
export function toActivityLogDto(a: ActivityLogDtoInput): ActivityLogItem {
  return {
    id: a._id.toString(),
    type: a.type,
    actor_name: a.actorName ?? '',
    meta: a.meta ?? {},
    created_at: a.createdAt.toISOString(),
  };
}

/** Minimal lean Comment shape `toCommentDto` needs (authorName denormalized). */
export type CommentDtoInput = {
  _id: { toString(): string };
  expense: { toString(): string };
  author: { toString(): string };
  authorName?: string | null;
  body: string;
  createdAt: Date;
};

/**
 * Lean Comment doc → frontend DTO. `author_name` is already denormalized on
 * the doc, so this needs no populate (avoids N+1 across a thread of comments).
 */
export function toCommentDto(c: CommentDtoInput): CommentDto {
  return {
    id: c._id.toString(),
    expense_id: c.expense.toString(),
    author_id: c.author.toString(),
    author_name: c.authorName ?? '',
    body: c.body,
    created_at: c.createdAt.toISOString(),
  };
}

/** Minimal lean Note shape `toTripNoteDto` needs (authorName denormalized). */
export type TripNoteDtoInput = {
  _id: { toString(): string };
  trip: { toString(): string };
  text: string;
  createdBy: { toString(): string };
  authorName?: string | null;
  attachments?: { key: string; contentType: string; size: number }[] | null;
  pinned?: boolean | null;
  plannedAt?: Date | null;
  plannedDayNumber?: number | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Lean Note doc → frontend DTO. `author_name` is denormalized at create time
 * (same as comments), so no populate is needed across a list of notes.
 * Attachments carry only key + metadata (no URL); viewing signs a short-lived GET.
 */
export function toTripNoteDto(n: TripNoteDtoInput): TripNote {
  return {
    id: n._id.toString(),
    trip_id: n.trip.toString(),
    text: n.text,
    author_id: n.createdBy.toString(),
    author_name: n.authorName ?? '',
    attachments: (n.attachments ?? []).map((a) => ({
      key: a.key,
      content_type: a.contentType,
      size: a.size,
    })),
    pinned: n.pinned ?? false,
    planned_at: n.plannedAt ? n.plannedAt.toISOString() : null,
    planned_day_number: n.plannedDayNumber ?? null,
    created_at: n.createdAt.toISOString(),
    updated_at: n.updatedAt.toISOString(),
  };
}
