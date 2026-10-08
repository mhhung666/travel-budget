import { ledgerSchema, type Ledger } from '@/api/contracts';
import { ApiError } from './client';
export function ledgerOf(value: unknown): Ledger {
  const ledger = value && typeof value === 'object' && 'ledger' in value ? value.ledger : undefined;
  if (ledger === undefined) return { baseCurrency: 'TWD', moneyScale: 2 };
  const parsed = ledgerSchema.safeParse(ledger);
  if (!parsed.success) throw new ApiError('LEDGER_DATA_INVALID');
  return parsed.data;
}
export const baseCurrency = (value: unknown) => ledgerOf(value).baseCurrency;
