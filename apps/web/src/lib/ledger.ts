import type { mongo } from 'mongoose';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { MoneyTotalError } from './money';
import * as contracts from '@travel-budget/contracts';
import { isSupportedCurrency, getAllCurrencyCodes } from '@/constants/currencies';

export class LedgerError extends Error {
  constructor(
    public code:
      | 'CLIENT_UPGRADE_REQUIRED'
      | 'LEDGER_CURRENCY_MISMATCH'
      | 'LEDGER_DATA_INVALID'
      | 'MONEY_TOTAL_OUT_OF_RANGE'
      | 'FEATURE_NOT_AVAILABLE'
      | 'VALIDATION_ERROR'
  ) {
    super(code);
  }
}
/** Share terminal accounting error mapping between wrappers and action-local catches. */
export function ledgerActionFailure(error: unknown) {
  if (error instanceof LedgerError)
    return { success: false as const, error: error.code, code: error.code };
  if (error instanceof MoneyTotalError)
    return {
      success: false as const,
      error: 'MONEY_TOTAL_OUT_OF_RANGE',
      code: 'MONEY_TOTAL_OUT_OF_RANGE' as const,
    };
  return undefined;
}
/**
 * Server-owned request context, never selected by a client header. Every ledger entry (Server
 * Action, `/api/v2`, public v2, AI drafts) runs in it since v1 was retired in B5; it records the
 * authorized trip unit and the unit the client confirmed. Services never branch on a version.
 */
const requests = new AsyncLocalStorage<{
  version: 2;
  expected?: string;
  ledger?: contracts.Ledger;
}>();
export const withLedgerV2 = <T>(work: () => T): T => requests.run({ version: 2 }, work);
/** For entry-point tests only: whether the caller set up the ledger context. */
export const inLedgerContext = () => requests.getStore()?.version === 2;
export function baseCurrency(record: object): string {
  const value = record as { baseCurrency?: unknown };
  if (value.baseCurrency === undefined) return 'TWD';
  if (typeof value.baseCurrency !== 'string' || !isSupportedCurrency(value.baseCurrency))
    throw new LedgerError('LEDGER_DATA_INVALID');
  return value.baseCurrency;
}
export function ledgerOf(value: object): contracts.Ledger {
  return { baseCurrency: baseCurrency(value), moneyScale: 2 };
}
export function authorizeLedger(value: object) {
  const ledger = ledgerOf(value);
  const state = requests.getStore();
  if (state) state.ledger = ledger;
  return ledger;
}
export function assertUnit(record: object, currency: string) {
  if (baseCurrency(record) !== currency) throw new LedgerError('LEDGER_DATA_INVALID');
}
export function currentLedger() {
  const ledger = requests.getStore()?.ledger;
  if (!ledger) throw new LedgerError('LEDGER_DATA_INVALID');
  return ledger;
}
export const ledgerMismatch = () => {
  const s = requests.getStore();
  return !!s?.expected && s.expected !== s.ledger?.baseCurrency;
};
export const ledgerStamp = () => ({ baseCurrency: currentLedger().baseCurrency });
export const receiptStamp = () => ({
  contractVersion: 2,
  ...(requests.getStore()?.ledger ? { ledger: currentLedger() } : {}),
});
/** A receipt without version 2 was stored by retired v1; it is refused, never replayed as v2. */
export function checkReceiptVersion(receipt: { contractVersion?: unknown; ledger?: unknown }) {
  if (receipt.contractVersion !== 2) throw new LedgerError('CLIENT_UPGRADE_REQUIRED');
  if (receipt.ledger !== undefined) {
    const unit = contracts.ledgerSchema.safeParse(receipt.ledger);
    if (!unit.success || !isSupportedCurrency(unit.data.baseCurrency))
      throw new LedgerError('LEDGER_DATA_INVALID');
    const actual = requests.getStore()?.ledger;
    if (actual && unit.data.baseCurrency !== actual.baseCurrency)
      throw new LedgerError('LEDGER_DATA_INVALID');
  }
}
export const ledgerFingerprint = (input: unknown) => ({
  contractVersion: 2,
  baseCurrency: requests.getStore()?.expected,
  input,
});
export function terminalWithLedger<T>(terminal: T): T {
  if (!requests.getStore()?.ledger) return terminal;
  const t = terminal as T & { result?: object };
  return {
    ...t,
    ledger: currentLedger(),
    ...(t.result ? { result: { ...t.result, ledger: currentLedger() } } : {}),
  };
}
export { moneyTotal } from './money';
export const nonTwdCreationEnabled = () => process.env.ENABLE_NON_TWD_LEDGER === 'true';
export const ledgerCapabilities = () => ({
  ledgerContractVersion: 2 as const,
  moneyScale: 2 as const,
  supportedBaseCurrencies: getAllCurrencyCodes(),
  nonTwdCreationEnabled: nonTwdCreationEnabled(),
});

const inputs = new Map<z.ZodType, z.ZodType>([
  [contracts.tripCreateInput, contracts.tripCreateV2Input],
  [contracts.expensePreviewInput, contracts.expensePreviewV2Input],
  [contracts.expenseCreateInput, contracts.expenseCreateV2Input],
  [contracts.expenseUpdateInput, contracts.expenseUpdateV2Input],
  [contracts.expenseDeleteInput, contracts.expenseDeleteV2Input],
  [contracts.paymentCreateInput, contracts.paymentCreateV2Input],
  [contracts.paymentDeleteInput, contracts.paymentDeleteV2Input],
  [contracts.tripCurrencyInput, contracts.tripCurrencyV2Input],
]);
export function ledgerInputSchema<T>(schema: z.ZodType<T>): z.ZodType<T> {
  return (inputs.get(schema) ?? schema) as z.ZodType<T>;
}
export function parseLedgerInput<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = ledgerInputSchema(schema).parse(body);
  const state = requests.getStore();
  const expected = (result as { base_currency?: string }).base_currency;
  if (expected && !isSupportedCurrency(expected)) throw new LedgerError('VALIDATION_ERROR');
  if (state && typeof (result as { base_currency?: unknown }).base_currency === 'string')
    state.expected = (result as { base_currency: string }).base_currency;
  return result;
}
export function ledgerOutput<T extends object>(
  value: T,
  ledger = currentLedger()
): T & { ledger: contracts.Ledger } {
  const result: Record<string, unknown> = { ...value, ledger };
  for (const key of ['expense', 'options', 'settlement', 'payment', 'result'])
    if (result[key] && typeof result[key] === 'object')
      result[key] = ledgerOutput(result[key] as object, ledger);
  if (Array.isArray(result.items))
    result.items = result.items.map((v: object) => ledgerOutput(v, ledger));
  return result as T & { ledger: contracts.Ledger };
}

export const ledgerRevision = (value: unknown) => ({
  contractVersion: 2,
  ledger: currentLedger(),
  value,
});

type LedgerParent = {
  _id: mongo.ObjectId;
  baseCurrency?: unknown;
  members?: { budget?: object | null }[];
};
/** Two indexed child probes per batch, independent of the number of trips. */
export async function validateLedgerChildrenBatch(
  db: mongo.Db,
  trips: LedgerParent[],
  session?: mongo.ClientSession
) {
  const groups = new Map<string, mongo.ObjectId[]>();
  for (const trip of trips) {
    const currency = baseCurrency(trip);
    for (const member of trip.members ?? []) if (member.budget) assertUnit(member.budget, currency);
    const ids = groups.get(currency) ?? [];
    ids.push(trip._id);
    groups.set(currency, ids);
  }
  if (!groups.size) return;
  const invalid = [...groups].map(([currency, ids]) => ({
    trip: { $in: ids },
    ...(currency === 'TWD'
      ? { $nor: [{ baseCurrency: 'TWD' }, { baseCurrency: { $exists: false } }] }
      : { baseCurrency: { $ne: currency } }),
  }));
  // MongoDB sessions do not support concurrent operations within a transaction.
  for (const collection of ['expenses', 'payments']) {
    if (
      await db.collection(collection).findOne({ $or: invalid }, { session, projection: { _id: 1 } })
    )
      throw new LedgerError('LEDGER_DATA_INVALID');
  }
}
export async function validateLedgerChildren(
  db: mongo.Db,
  trip: LedgerParent,
  session?: mongo.ClientSession
) {
  return validateLedgerChildrenBatch(db, [trip], session);
}
