import { ledgerSchema } from '@travel-budget/contracts';
import { isSupportedCurrency } from '@/constants/currencies';
export function requireWebLedger<T>(value: T): T {
  if (!value || typeof value !== 'object') throw new Error('LEDGER_DATA_INVALID');
  if (Array.isArray(value)) {
    value.forEach(requireWebLedger);
    return value;
  }
  const data = value as Record<string, unknown>;
  if ('trip' in data && 'shell' in data) {
    requireWebLedger(data.trip);
    requireWebLedger(data.shell);
    return value;
  }
  const result = ledgerSchema.safeParse(data.ledger);
  if (!result.success || !isSupportedCurrency(result.data.baseCurrency))
    throw new Error('LEDGER_DATA_INVALID');
  return value;
}
