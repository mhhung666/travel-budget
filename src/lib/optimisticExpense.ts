import type { CreateExpenseInput } from '@/lib/validation';
import type { Expense } from '@/types';

/**
 * Optimistic-expense helpers for offline-first writes (ROADMAP #5 Phase 2).
 *
 * When an expense is created offline (or while a request is in flight) we insert
 * a placeholder into the TanStack Query cache so it shows immediately, then let
 * the real server result reconcile on reconnect. Placeholders carry a synthetic
 * id prefixed with {@link OPTIMISTIC_ID_PREFIX} so the UI can flag them as
 * "syncing" and disable edit/delete (they have no server id yet).
 */

export const OPTIMISTIC_ID_PREFIX = 'optimistic_';

/** True when an expense id is a not-yet-synced optimistic placeholder. */
export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}

/** Generate a fresh optimistic placeholder id. */
export function newOptimisticId(): string {
  return `${OPTIMISTIC_ID_PREFIX}${crypto.randomUUID()}`;
}

interface MemberLite {
  id: string;
  username: string;
  display_name: string;
}

interface OptimisticContext {
  tripId: string;
  members: MemberLite[];
  /** Synthetic placeholder id (see {@link newOptimisticId}). */
  id: string;
  /** ISO timestamp for `created_at`. */
  createdAt: string;
}

/**
 * Build a fully-shaped {@link Expense} DTO from a create input, resolving member
 * display names locally (no server round trip) so the optimistic row renders
 * identically to a real one. The TWD `amount` is derived the same way the server
 * does (`original_amount * exchange_rate`).
 */
export function buildOptimisticExpense(input: CreateExpenseInput, ctx: OptimisticContext): Expense {
  const memberById = new Map(ctx.members.map((m) => [m.id, m]));
  const payer = memberById.get(input.payer_id);

  return {
    id: ctx.id,
    trip_id: ctx.tripId,
    payer_id: input.payer_id,
    payer_name: payer?.display_name ?? payer?.username ?? '',
    amount: input.original_amount * input.exchange_rate,
    original_amount: input.original_amount,
    currency: input.currency,
    exchange_rate: input.exchange_rate,
    description: input.description,
    category: input.category,
    date: input.date,
    created_at: ctx.createdAt,
    splits: input.splits.map((s) => {
      const m = memberById.get(s.user_id);
      return {
        user_id: s.user_id,
        username: m?.username ?? '',
        display_name: m?.display_name ?? m?.username ?? '',
        share_amount: s.share_amount,
      };
    }),
    attachments: (input.attachments ?? []).map((a) => ({
      key: a.key,
      content_type: a.content_type,
      size: a.size,
    })),
    itinerary_day_id: input.itinerary_day_id ?? null,
  };
}
