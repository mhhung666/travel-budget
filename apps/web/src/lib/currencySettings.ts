import { mongo } from 'mongoose';
import { isLedgerV2, currentLedger } from './ledger';
import { isSupportedCurrency } from '@/constants/currencies';
import { TripManagementError } from './tripManagementError';
import { withTripWriteInDatabase } from './tripWriteTransaction';
interface SettingsInput {
  default_currency?: string | null;
  currencies?: { code: string; rate?: number | null }[];
}
/** Web and HTTP use the same normalization and parent transaction. */
export function normalizeCurrencySettings(input: SettingsInput) {
  const byCode = new Map<string, number | null>();
  if ((input.currencies?.length ?? 0) > 30) throw new TripManagementError('VALIDATION_ERROR');
  for (const c of input.currencies ?? []) {
    if (
      !isSupportedCurrency(c.code) ||
      (c.rate != null && (!Number.isFinite(c.rate) || c.rate <= 0))
    )
      throw new TripManagementError('VALIDATION_ERROR');
    byCode.set(
      c.code,
      c.code === (isLedgerV2() ? currentLedger().baseCurrency : 'TWD') ? null : (c.rate ?? null)
    );
  }
  const defaultCurrency = input.default_currency ?? null;
  if (defaultCurrency && !isSupportedCurrency(defaultCurrency))
    throw new TripManagementError('VALIDATION_ERROR');
  return defaultCurrency === null && byCode.size === 0
    ? null
    : {
        defaultCurrency,
        currencies: Array.from(byCode, ([code, rate]) => ({ code, rate })),
      };
}
export async function applyCurrencySettings(
  db: mongo.Db,
  session: mongo.ClientSession,
  id: mongo.ObjectId,
  currencySettings: ReturnType<typeof normalizeCurrencySettings>
) {
  await db.collection('trips').updateOne({ _id: id }, { $set: { currencySettings } }, { session });
}
export function setCurrencySettingsForActor(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  input: SettingsInput
) {
  return withTripWriteInDatabase(
    db,
    tripId,
    actorId,
    async (session) => {
      const id = new mongo.ObjectId(tripId);
      await applyCurrencySettings(db, session, id, normalizeCurrencySettings(input));
      return db.collection('trips').findOne({ _id: id }, { session });
    },
    'admin'
  );
}
