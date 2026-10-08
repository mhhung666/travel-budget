import { baseCurrency } from '@/api/ledger';
import {
  paymentFieldsSchema,
  paymentContextSchema,
  paymentRevokeContextSchema,
  type PaymentContext,
  type PaymentRevokeContext,
} from '@/api/contracts';
import { parseAmount } from '@/features/expenses/input';
import type { EntryRequest } from '@/features/expenses/entry';
export interface PaymentFields {
  fromId: string;
  toId: string;
  amountText: string;
  note: string;
}
export function paymentFields(
  context: PaymentContext,
  seed: Partial<PaymentFields> = {}
): PaymentFields {
  return {
    fromId: seed.fromId ?? context.members[0]?.id ?? '',
    toId: seed.toId ?? context.members[1]?.id ?? '',
    amountText: seed.amountText ?? '',
    note: seed.note ?? '',
  };
}
export function paymentInput(context: PaymentContext, fields: PaymentFields) {
  const amount = parseAmount(fields.amountText, baseCurrency(context), baseCurrency(context));
  if (
    !amount.ok ||
    ![fields.fromId, fields.toId].every((id) => context.members.some((m) => m.id === id))
  )
    throw new Error('INVALID_PAYMENT');
  return paymentFieldsSchema.parse({
    from_id: fields.fromId,
    to_id: fields.toId,
    amount: amount.amount,
    note: fields.note,
  });
}
/** Only compares with backend suggestions; never computes balances on the client. */
export function paymentSuggestion(context: PaymentContext, fields: PaymentFields) {
  return (
    context.settlement.suggestedTransfers.find(
      (t) => t.fromId === fields.fromId && t.toId === fields.toId
    )?.amount ?? null
  );
}
export async function preparePayment(
  request: EntryRequest,
  accountId: string,
  tripId: string,
  context: PaymentContext,
  fields: PaymentFields,
  beforeSend: () => void
) {
  const current = await request(
    accountId,
    `/trips/${tripId}/payment-context`,
    paymentContextSchema,
    { beforeSend }
  );
  beforeSend();
  if (
    current.settlementRevision !== context.settlementRevision ||
    baseCurrency(current) !== baseCurrency(context)
  )
    return { current, body: null };
  return {
    current,
    body: {
      ...(current.ledger ? { base_currency: baseCurrency(current) } : {}),
      ...paymentInput(current, fields),
      expected_revision: current.settlementRevision,
    },
  };
}
export async function preparePaymentRevocation(
  request: EntryRequest,
  accountId: string,
  tripId: string,
  paymentId: string,
  context: PaymentRevokeContext,
  beforeSend: () => void
) {
  const current = await request(
    accountId,
    `/trips/${tripId}/payments/${paymentId}/revoke-context`,
    paymentRevokeContextSchema,
    { beforeSend }
  );
  beforeSend();
  return {
    current,
    body:
      current.revision === context.revision && baseCurrency(current) === baseCurrency(context)
        ? {
            ...(current.ledger ? { base_currency: baseCurrency(current) } : {}),
            expected_revision: current.revision,
          }
        : null,
  };
}
