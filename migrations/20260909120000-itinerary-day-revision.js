/**
 * Backfill the explicit day revision before deploying revision-aware writers.
 * Drain old application writers during rollout; they do not increment revision.
 * Roll back the application before down, which invalidates revision-based clients.
 */
/** @param {import('mongodb').Db} db */
export const up = async (db) => {
  await db
    .collection('itinerarydays')
    .updateMany({ revision: { $exists: false } }, { $set: { revision: 0 } });
};

/** @param {import('mongodb').Db} db */
export const down = async (db) => {
  await db
    .collection('itinerarydays')
    .updateMany({ revision: { $exists: true } }, { $unset: { revision: '' } });
};
