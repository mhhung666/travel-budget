// Drain old itinerary writers before migrating and deploying all new writers.
/** @param {import('mongodb').Db} db */
export const up = async (db) => {
  await db
    .collection('itinerarydays')
    .updateMany(
      { activities: { $elemMatch: { revision: { $exists: false } } } },
      { $set: { 'activities.$[activity].revision': 0 } },
      { arrayFilters: [{ 'activity.revision': { $exists: false } }] }
    );
};

// Stop revision clients and revert the application before rolling back.
/** @param {import('mongodb').Db} db */
export const down = async (db) => {
  await db
    .collection('itinerarydays')
    .updateMany(
      { 'activities.revision': { $exists: true } },
      { $unset: { 'activities.$[].revision': '' } }
    );
};
