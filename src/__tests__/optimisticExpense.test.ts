import { describe, it, expect } from 'vitest';
import {
  buildOptimisticExpense,
  isOptimisticId,
  newOptimisticId,
  OPTIMISTIC_ID_PREFIX,
} from '@/lib/optimisticExpense';
import type { CreateExpenseInput } from '@/lib/validation';

const members = [
  { id: 'a', username: 'alice', display_name: 'Alice' },
  { id: 'b', username: 'bob', display_name: 'Bob' },
];

const baseInput: CreateExpenseInput = {
  payer_id: 'a',
  original_amount: 300,
  currency: 'JPY',
  exchange_rate: 0.21,
  description: 'Ramen',
  category: 'food',
  date: '2026-06-28',
  splits: [
    { user_id: 'a', share_amount: 31.5 },
    { user_id: 'b', share_amount: 31.5 },
  ],
};

const ctx = { tripId: 't1', members, id: 'optimistic_x', createdAt: '2026-06-28T00:00:00.000Z' };

describe('isOptimisticId / newOptimisticId', () => {
  it('flags optimistic ids and not real ones', () => {
    expect(isOptimisticId('optimistic_abc')).toBe(true);
    expect(isOptimisticId('663b1f...realObjectId')).toBe(false);
  });

  it('newOptimisticId is prefixed and unique', () => {
    const a = newOptimisticId();
    const b = newOptimisticId();
    expect(a.startsWith(OPTIMISTIC_ID_PREFIX)).toBe(true);
    expect(a).not.toEqual(b);
    expect(isOptimisticId(a)).toBe(true);
  });
});

describe('buildOptimisticExpense', () => {
  it('derives TWD amount from original_amount * exchange_rate', () => {
    const e = buildOptimisticExpense(baseInput, ctx);
    expect(e.amount).toBeCloseTo(63, 5);
    expect(e.original_amount).toBe(300);
    expect(e.currency).toBe('JPY');
  });

  it('resolves payer + split display names from members', () => {
    const e = buildOptimisticExpense(baseInput, ctx);
    expect(e.payer_name).toBe('Alice');
    expect(e.splits.map((s) => s.display_name)).toEqual(['Alice', 'Bob']);
    expect(e.splits[0].username).toBe('alice');
  });

  it('carries the synthetic id, trip id and created_at', () => {
    const e = buildOptimisticExpense(baseInput, ctx);
    expect(e.id).toBe('optimistic_x');
    expect(e.trip_id).toBe('t1');
    expect(e.created_at).toBe('2026-06-28T00:00:00.000Z');
  });

  it('falls back to empty names when the member is unknown', () => {
    const e = buildOptimisticExpense({ ...baseInput, payer_id: 'ghost' }, ctx);
    expect(e.payer_name).toBe('');
  });

  it('defaults attachments and itinerary_day_id when omitted', () => {
    const e = buildOptimisticExpense(baseInput, ctx);
    expect(e.attachments).toEqual([]);
    expect(e.itinerary_day_id).toBeNull();
  });

  it('maps attachments and itinerary link when provided', () => {
    const e = buildOptimisticExpense(
      {
        ...baseInput,
        attachments: [{ key: 'receipts/t1/x.webp', content_type: 'image/webp', size: 1234 }],
        itinerary_day_id: 'day1',
      },
      ctx
    );
    expect(e.attachments).toEqual([
      { key: 'receipts/t1/x.webp', content_type: 'image/webp', size: 1234 },
    ]);
    expect(e.itinerary_day_id).toBe('day1');
  });
});
