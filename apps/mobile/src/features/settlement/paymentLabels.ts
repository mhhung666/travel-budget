import type { PaymentContext, PaymentRevokeContext, ExpenseOptions } from '@/api/contracts';
import { createMemberLabelIndex, type ReadMember } from '@/features/expenses/rows';
import type { Messages } from '@/i18n/messages';
import { settlementMembers } from './view';

/** One index per immutable context; never mix a pre-conflict context with the latest response. */
export function paymentLabels(
  data: PaymentContext | PaymentRevokeContext | null,
  viewerId: string | undefined,
  t: Messages,
  roster?: ExpenseOptions['members']
) {
  const key = (member: ReadMember) => JSON.stringify([member.id, member.name]);
  const parties: ReadMember[] = !data
    ? []
    : 'members' in data
      ? settlementMembers(data.settlement)
      : [
          {
            id: data.payment.fromId,
            name: data.payment.fromName,
            isVirtual: data.payment.fromIsVirtual,
          },
          { id: data.payment.toId, name: data.payment.toName, isVirtual: data.payment.toIsVirtual },
        ];
  const labels = createMemberLabelIndex(
    data && 'members' in data ? data.members : roster,
    parties,
    viewerId,
    t
  );
  const choices = new Map(
    data && 'members' in data
      ? data.members.map((m) => [m.id, labels.label({ id: m.id, name: m.displayName })])
      : []
  );
  const known = new Map(parties.map((m) => [key(m), labels.label(m)]));
  return {
    party: (id: string | null, name: string) =>
      known.get(key({ id, name })) ?? labels.label({ id, name }),
    choice: (id: string) => choices.get(id) ?? labels.label({ id, name: '' }),
  };
}
