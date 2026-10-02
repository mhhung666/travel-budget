import { z } from 'zod';

const id = z.string().regex(/^[a-f0-9]{24}$/);

/** Server-owned snapshot, embedded with the Expense insert; never populated from client input. */
export const expenseDeliveryEventSchema = z
  .object({
    version: z.literal(1),
    eventKey: z.string(),
    expenseId: id,
    tripId: id,
    actorId: id,
    actorName: z.string(),
    tripName: z.string(),
    tripHashCode: z.string(),
    memberIds: z.array(id),
    description: z.string(),
    amount: z.number().finite().nonnegative(),
    occurredAt: z.date(),
  })
  .strict()
  .refine((event) => event.eventKey === `expense_added:${event.expenseId}`, {
    message: 'Invalid expense event identity',
  });

export type ExpenseDeliveryEvent = z.infer<typeof expenseDeliveryEventSchema>;

export function createExpenseDeliveryEvent(
  input: Omit<ExpenseDeliveryEvent, 'version' | 'eventKey'>
): ExpenseDeliveryEvent {
  return expenseDeliveryEventSchema.parse({
    ...input,
    version: 1,
    eventKey: `expense_added:${input.expenseId}`,
    memberIds: [...new Set(input.memberIds)],
    occurredAt: new Date(input.occurredAt.getTime()),
  });
}

/** Event-time members intersect current, existing, real members; actor never receives own alert. */
export function expenseEventRecipients(
  event: ExpenseDeliveryEvent,
  currentMembers: string[],
  users: { id: string; isVirtual?: boolean | null }[]
): string[] {
  const current = new Set(currentMembers);
  const real = new Set(users.filter((user) => !user.isVirtual).map((user) => user.id));
  return [...new Set(event.memberIds)].filter(
    (member) => member !== event.actorId && current.has(member) && real.has(member)
  );
}
