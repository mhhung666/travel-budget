const COLLECTION = 'expensecreaterequests';
const INDEX = 'expense_create_request_trip';
const OWNER = '20260912160000-expense-create-requests';

export async function up(db) {
  const exists = await db.listCollections({ name: COLLECTION }).hasNext();
  if (!exists) await db.createCollection(COLLECTION);
  const indexes = await db.collection(COLLECTION).listIndexes().toArray();
  const existing = indexes.find((index) => index.name === INDEX);
  if (existing) {
    if (
      JSON.stringify(existing.key) !== JSON.stringify({ trip: 1 }) ||
      existing.unique ||
      existing.sparse ||
      existing.partialFilterExpression ||
      existing.expireAfterSeconds !== undefined ||
      existing.hidden
    )
      throw new Error('Incompatible expense request index');
    return;
  }
  await db
    .collection('index_migration_ownership')
    .updateOne(
      { _id: OWNER },
      { $setOnInsert: { collection: COLLECTION, index: INDEX } },
      { upsert: true }
    );
  await db.collection(COLLECTION).createIndex({ trip: 1 }, { name: INDEX });
}

export async function down(db) {
  if (!(await db.collection('index_migration_ownership').findOne({ _id: OWNER }))) return;
  try {
    await db.collection(COLLECTION).dropIndex(INDEX);
  } catch (error) {
    if (error.code !== 26 && error.code !== 27) throw error;
  }
  await db.collection('index_migration_ownership').deleteOne({ _id: OWNER });
  // Retain receipts: rollback must never allow accepted requests to create duplicate expenses.
}
