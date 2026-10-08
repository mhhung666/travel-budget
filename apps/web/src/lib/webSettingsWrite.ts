import { createHmac, createHash } from 'node:crypto';
import { mongo } from 'mongoose';
import { z } from 'zod';
import { getEnv } from './env';
import { withTripWriteInDatabase } from './tripWriteTransaction';
import { currentLedger, ledgerOf, LedgerError, receiptStamp, checkReceiptVersion } from './ledger';
import { setBudgetSchema, setCurrencySettingsSchema } from './validation';
import { normalizeBudget } from './budgetWrite';
import { normalizeCurrencySettings, applyCurrencySettings } from './currencySettings';
export const WEB_SETTINGS_RECEIPTS = 'mutationrequests';
function canonical(v: unknown): unknown {
  if (v === undefined) return { missing: true };
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(canonical);
  return Object.fromEntries(
    Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => [k, canonical(x)])
  );
}
export function webSettingsRevision(
  tripId: string,
  actorId: string | undefined,
  unit: object,
  kind: 'budget' | 'currency',
  value: unknown
) {
  return createHmac('sha256', getEnv().JWT_SECRET)
    .update(
      JSON.stringify(
        canonical({ version: 2, tripId, actorId, ledger: ledgerOf(unit), kind, value })
      )
    )
    .digest('hex');
}
export async function writeWebSettings(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  kind: 'budget' | 'currency',
  body: unknown
) {
  const input = (kind === 'budget' ? setBudgetSchema : setCurrencySettingsSchema)
    .extend({
      client_request_id: z.string().uuid(),
      expected_revision: z.string().regex(/^[a-f0-9]{64}$/),
      base_currency: setBudgetSchema.shape.base_currency.unwrap(),
    })
    .parse(body);
  const key = `${actorId.toLowerCase()}:${input.client_request_id.toLowerCase()}`;
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(canonical({ version: 2, kind, tripId, input })))
    .digest('hex');
  return withTripWriteInDatabase(
    db,
    tripId,
    actorId,
    async (session) => {
      const collection = db.collection(WEB_SETTINGS_RECEIPTS);
      const existing = await collection.findOne({ _id: key as never }, { session });
      if (existing) {
        checkReceiptVersion({ contractVersion: existing.contractVersion, ledger: existing.ledger });
        if (existing.webSettingsKind !== kind) throw new LedgerError('VALIDATION_ERROR');
        if (existing.fingerprint !== fingerprint) throw new LedgerError('VALIDATION_ERROR');
        return existing.terminal;
      }
      const trip = await db
        .collection('trips')
        .findOne({ _id: new mongo.ObjectId(tripId) }, { session });
      const budget = trip!.members.find(
        (m: { user: mongo.ObjectId }) => m.user.toString() === actorId
      )?.budget;
      const revision = webSettingsRevision(
        tripId,
        kind === 'budget' ? actorId : undefined,
        trip!,
        kind,
        kind === 'budget' ? budget : trip!.currencySettings
      );
      const code =
        input.base_currency !== currentLedger().baseCurrency
          ? 'LEDGER_CURRENCY_MISMATCH'
          : input.expected_revision !== revision
            ? 'RESOURCE_CHANGED'
            : null;
      if (!code) {
        if (kind === 'budget') {
          const next = normalizeBudget(setBudgetSchema.parse(input));
          await db
            .collection('trips')
            .updateOne(
              { _id: trip!._id, 'members.user': new mongo.ObjectId(actorId) },
              { $set: { 'members.$.budget': next } },
              { session }
            );
        } else
          await applyCurrencySettings(
            db,
            session,
            trip!._id,
            normalizeCurrencySettings(setCurrencySettingsSchema.parse(input))
          );
      }
      const terminal = code
        ? { status: 'rejected', operation: `${kind}.set`, tripId, code, ledger: currentLedger() }
        : {
            status: 'committed',
            operation: `${kind}.set`,
            result: { tripId, updated: true, ledger: currentLedger() },
            ledger: currentLedger(),
          };
      await collection.insertOne(
        {
          _id: key as never,
          fingerprint,
          terminal,
          ...receiptStamp(),
          webSettingsKind: kind,
          trip: new mongo.ObjectId(tripId),
          createdAt: new Date(),
        },
        { session }
      );
      return terminal;
    },
    kind === 'currency' ? 'admin' : undefined
  );
}
export async function readWebSettingsReceipt(db: mongo.Db, actorId: string, id: string) {
  const r = await db
    .collection(WEB_SETTINGS_RECEIPTS)
    .findOne({ _id: `${actorId.toLowerCase()}:${id.toLowerCase()}` as never });
  if (!r?.webSettingsKind) return;
  return withTripWriteInDatabase(db, r.trip.toString(), actorId, async () => {
    checkReceiptVersion({ contractVersion: r.contractVersion, ledger: r.ledger });
    return r.terminal;
  });
}
