const COLLECTION = 'blobcleanupjobs';
const INDEX = 'blob_cleanup_available';
const OWNER = '20260911090000-blob-cleanup-jobs';

export async function up(db) {
  const exists = await db.listCollections({ name: COLLECTION }).hasNext();
  if (!exists) await db.createCollection(COLLECTION);
  const indexes = await db.collection(COLLECTION).listIndexes().toArray();
  const existing = indexes.find((index) => index.name === INDEX);
  if (existing) {
    if (
      JSON.stringify(existing.key) !== JSON.stringify({ availableAt: 1 }) ||
      existing.unique ||
      existing.sparse ||
      existing.partialFilterExpression ||
      existing.expireAfterSeconds !== undefined ||
      existing.hidden
    )
      throw new Error('Incompatible blob cleanup index');
    return;
  }
  await db
    .collection('index_migration_ownership')
    .updateOne(
      { _id: OWNER },
      { $setOnInsert: { collection: COLLECTION, index: INDEX } },
      { upsert: true }
    );
  await db.collection(COLLECTION).createIndex({ availableAt: 1 }, { name: INDEX });
}

export async function down(db) {
  if (!(await db.collection('index_migration_ownership').findOne({ _id: OWNER }))) return;
  try {
    await db.collection(COLLECTION).dropIndex(INDEX);
  } catch (error) {
    if (error.code !== 26 && error.code !== 27) throw error;
  }
  await db.collection('index_migration_ownership').deleteOne({ _id: OWNER });
  // Retain durable jobs: rollback must never silently discard unfinished cleanup.
}
