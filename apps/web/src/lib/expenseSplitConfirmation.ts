import { expensePreviewV2Input, type expenseSplitInput } from '@travel-budget/contracts';
import type { z } from 'zod';
import { computeLedgerSplits } from './expenseSplit';
import { currentLedger } from './ledger';
import { roundMoney } from './money';
import { MAX_EXPENSE_AMOUNT } from '@travel-budget/contracts';
import { isSupportedCurrency } from '@/constants/currencies';

/** Members must come from the transaction snapshot, in the same stable order as preview. */
export function confirmedExpenseShares(
  input: {
    original_amount: number;
    currency: string;
    exchange_rate: number;
    payer_id: string;
    splits: { user_id: string; share_amount: number }[];
    split: z.infer<typeof expenseSplitInput>;
  },
  members: { id: string }[]
): Record<string, number> | null {
  const parsed = expensePreviewV2Input.safeParse({
    base_currency: currentLedger().baseCurrency,
    amount: input.original_amount,
    currency: input.currency,
    exchange_rate: input.exchange_rate,
    member_ids: input.splits.map((s) => s.user_id),
    split: input.split,
  });
  const product = input.original_amount * input.exchange_rate;
  const known = new Set(members.map((m) => m.id));
  if (
    !parsed.success ||
    !isSupportedCurrency(input.currency) ||
    roundMoney(input.original_amount) !== input.original_amount ||
    !Number.isFinite(product) ||
    roundMoney(product) > MAX_EXPENSE_AMOUNT ||
    !known.has(input.payer_id) ||
    input.splits.some((s) => !known.has(s.user_id))
  )
    return null;
  const { split, member_ids } = parsed.data;
  const values = new Map(
    member_ids.map((id, i) => [id, split?.mode === 'equal' ? null : split!.values[i]])
  );
  const result = computeLedgerSplits(
    split!.mode,
    members.map((m) => ({
      id: m.id,
      selected: values.has(m.id),
      value: values.get(m.id) == null ? '' : String(values.get(m.id)),
    })),
    input.original_amount,
    input.exchange_rate
  );
  // Confirmation is exact, including zero and the owner of every remainder cent.
  if (!result.balanced || input.splits.some((s) => result.ledger[s.user_id] !== s.share_amount))
    return null;
  return result.ledger;
}
