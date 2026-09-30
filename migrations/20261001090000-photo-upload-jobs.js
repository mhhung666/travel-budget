/** Run before deploying the uploader. No TTL: unfinished keys must remain discoverable. */
export async function up(db) {
  await db
    .collection('photouploadjobs')
    .createIndex({ status: 1, expiresAt: 1 }, { name: 'photo_upload_expiry' });
  await db.collection('photouploadjobs').createIndex({ trip: 1 }, { name: 'photo_upload_trip' });
  await db.collection('photos').createIndex(
    { trip: 1, sourceHash: 1 },
    {
      name: 'photo_trip_source_hash',
      unique: true,
      partialFilterExpression: { sourceHash: { $type: 'string' } },
    }
  );
}

// Keep jobs and the uniqueness constraint on rollback. Dropping either would compromise
// live uploads from clients that have not refreshed; removal requires a separate migration.
export async function down() {}
