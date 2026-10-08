/**
 * Operations saved by a release that still sent v1 (B5d-1). They keep decoding, but are never
 * sent or looked up again, and are never relabelled as v2: the user may only discard them (an
 * unprepared queued expense may also go back to a draft). Only fixtures were on v1, so this is
 * not a way to finish them.
 */
type Saved = { apiVersion?: 1 | 2 };

/** C expense records: a record from before `apiVersion` existed is v2 only if its body says so. */
export const retiredExpense = (record: Saved & { payload: object }) =>
  (record.apiVersion ?? ('base_currency' in record.payload ? 2 : 1)) === 1;

/** E mutation records and D queued expenses: an unlabelled record predates v2. */
export const retiredOperation = (record: Saved) => (record.apiVersion ?? 1) === 1;
