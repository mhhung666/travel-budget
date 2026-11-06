// No clock-based inference: legacy dates remain explicitly unconfirmed.
/** @param {import('mongodb').Db} db */
export const up = async (db) => {
  await db
    .collection('itinerarydays')
    .updateMany(
      { activities: { $elemMatch: { endDayOffset: { $exists: false } } } },
      { $set: { 'activities.$[activity].endDayOffset': null } },
      { arrayFilters: [{ 'activity.endDayOffset': { $exists: false } }] }
    );
};

// Stop cross-day writers before rollback. Explicit dates cannot survive this downgrade.
/** @param {import('mongodb').Db} db */
export const down = async (db) => {
  await db
    .collection('itinerarydays')
    .updateMany(
      { 'activities.endDayOffset': { $exists: true } },
      { $unset: { 'activities.$[].endDayOffset': '' } }
    );
};
