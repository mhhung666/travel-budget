import { describe, expect, it } from 'vitest';
import {
  createExpenseDeliveryEvent,
  expenseDeliveryEventSchema,
  expenseEventRecipients,
} from '@/lib/expenseDeliveryEvent';

const actor = '507f191e810c19729de860ea';
const member = '507f191e810c19729de860eb';
const extra = '507f191e810c19729de860ec';
const input = {
  expenseId: '507f1f77bcf86cd799439011',
  tripId: '507f1f77bcf86cd799439012',
  actorId: actor,
  actorName: 'Actor',
  tripName: 'Trip',
  tripHashCode: 'trip-code',
  memberIds: [actor, member, member],
  description: 'Dinner',
  amount: 120,
  occurredAt: new Date('2026-09-05T12:00:00Z'),
};

describe('expense event snapshot', () => {
  it('uses stable event identity and copies event-time mutable values', () => {
    const source = {
      ...input,
      memberIds: [...input.memberIds],
      occurredAt: new Date(input.occurredAt),
    };
    const event = createExpenseDeliveryEvent(source);
    source.description = 'Edited';
    source.amount = 999;
    source.memberIds.push(extra);
    source.occurredAt.setTime(0);
    expect(event).toMatchObject({
      version: 1,
      eventKey: `expense_added:${input.expenseId}`,
      description: 'Dinner',
      amount: 120,
      memberIds: [actor, member],
      occurredAt: input.occurredAt,
    });
    expect(createExpenseDeliveryEvent(input).eventKey).toBe(event.eventKey);
  });

  it('filters removed, missing, virtual, new members and the actor', () => {
    const event = createExpenseDeliveryEvent(input);
    expect(
      expenseEventRecipients(
        event,
        [actor, member, extra],
        [{ id: actor }, { id: member }, { id: extra }]
      )
    ).toEqual([member]);
    expect(expenseEventRecipients(event, [actor, member], [{ id: actor }])).toEqual([]);
    expect(expenseEventRecipients(event, [actor], [{ id: member }])).toEqual([]);
    expect(expenseEventRecipients(event, [member], [{ id: member, isVirtual: true }])).toEqual([]);
  });

  it.each([
    { amount: Infinity },
    { amount: -1 },
    { expenseId: 'invalid' },
    { occurredAt: new Date(NaN) },
  ])('rejects malformed snapshots (%s)', (change) => {
    expect(() => createExpenseDeliveryEvent({ ...input, ...change })).toThrow();
  });

  it('rejects a mismatched event identity or unsupported version', () => {
    const event = createExpenseDeliveryEvent(input);
    expect(expenseDeliveryEventSchema.safeParse({ ...event, eventKey: 'other' }).success).toBe(
      false
    );
    expect(expenseDeliveryEventSchema.safeParse({ ...event, version: 2 }).success).toBe(false);
  });
});
