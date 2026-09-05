/**
 * Additive indexes validated by docs/MONGODB_INDEX_RESULTS.md.
 * Run before deploying matching schemas. Never run concurrently with another DDL runner.
 * A ledger protects pre-existing/autoIndex-created indexes from rollback deletion.
 */
const MIGRATION = '20260905093000-core-query-indexes';
const LEDGER = 'index_migration_ownership';
const CI = { locale: 'en', strength: 2 };
const INDEXES = [
  {
    collection: 'expenses',
    key: { trip: 1, date: -1, createdAt: -1 },
    name: 'trip_1_date_-1_createdAt_-1',
  },
  { collection: 'expenses', key: { createdAt: 1 }, name: 'createdAt_1' },
  { collection: 'payments', key: { trip: 1, createdAt: -1 }, name: 'trip_1_createdAt_-1' },
  { collection: 'checklists', key: { trip: 1, createdAt: 1 }, name: 'trip_1_createdAt_1' },
  {
    collection: 'photos',
    key: { trip: 1, takenAt: -1, createdAt: -1 },
    name: 'trip_1_takenAt_-1_createdAt_-1',
  },
  {
    collection: 'users',
    key: { username: 1 },
    name: 'username_ci_unique',
    unique: true,
    collation: CI,
  },
  { collection: 'users', key: { email: 1 }, name: 'email_ci_unique', unique: true, collation: CI },
];

async function listIndexes(db, collection) {
  try {
    return await db.collection(collection).listIndexes().toArray();
  } catch (error) {
    if (error.code === 26) return [];
    throw error;
  }
}

function assertCompatible(existing, expected) {
  const collation = existing.collation;
  const matchingCollation = expected.collation
    ? collation?.locale === 'en' &&
      collation.strength === 2 &&
      !collation.caseLevel &&
      !collation.numericOrdering &&
      !collation.backwards &&
      (!collation.caseFirst || collation.caseFirst === 'off') &&
      (!collation.alternate || collation.alternate === 'non-ignorable') &&
      !collation.normalization
    : !collation || collation.locale === 'simple';
  if (
    JSON.stringify(existing.key) !== JSON.stringify(expected.key) ||
    Boolean(existing.unique) !== Boolean(expected.unique) ||
    !matchingCollation ||
    existing.sparse ||
    existing.partialFilterExpression ||
    existing.hidden ||
    existing.expireAfterSeconds !== undefined
  ) {
    throw new Error(`Incompatible existing index: ${expected.collection}.${expected.name}`);
  }
}

async function audit(db) {
  for (const field of ['username', 'email']) {
    const invalid = await db
      .collection('users')
      .countDocuments({ $expr: { $ne: [{ $type: `$${field}` }, 'string'] } }, { maxTimeMS: 60000 });
    const duplicates = await db
      .collection('users')
      .aggregate(
        [
          { $group: { _id: `$${field}`, count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $limit: 1 },
          { $project: { _id: 0, count: 1 } },
        ],
        { collation: CI, maxTimeMS: 60000, allowDiskUse: false }
      )
      .toArray();
    if (invalid || duplicates.length)
      throw new Error(`Resolve ${field} duplicates/non-string values before migration`);
  }
}

export async function up(db) {
  await audit(db);
  // Preflight every definition before any DDL. Identical pre-existing indexes are not ours.
  const plans = [];
  for (const index of INDEXES) {
    const existing = (await listIndexes(db, index.collection)).find((i) => i.name === index.name);
    if (existing) assertCompatible(existing, index);
    plans.push({ index, existing });
  }
  for (const { index, existing } of plans) {
    const { collection, key, ...options } = index;
    const id = `${MIGRATION}:${collection}:${index.name}`;
    // Record intent BEFORE creation so interrupted runs remain safely recoverable.
    await db
      .collection(LEDGER)
      .updateOne({ _id: id }, { $setOnInsert: { owned: !existing } }, { upsert: true });
    if (!existing)
      await db
        .collection(collection)
        .createIndex(key, { ...options, collation: options.collation ?? { locale: 'simple' } });
  }
}

export async function down(db) {
  // Roll back schema/stop autoIndex first. Retain every index not owned by this migration.
  for (const index of [...INDEXES].reverse()) {
    const id = `${MIGRATION}:${index.collection}:${index.name}`;
    const record = await db.collection(LEDGER).findOne({ _id: id });
    if (!record) continue;
    if (record.owned) {
      const existing = (await listIndexes(db, index.collection)).find((i) => i.name === index.name);
      if (existing) {
        assertCompatible(existing, index);
        try {
          await db.collection(index.collection).dropIndex(index.name);
        } catch (error) {
          if (error.code !== 27 && error.codeName !== 'IndexNotFound') throw error;
        }
      }
    }
    await db.collection(LEDGER).deleteOne({ _id: id });
  }
}
